/**
 * HKD Debug Session & Runtime Debug Controller
 *
 * Bridges VS Code DAP requests directly to the HKD Stack VM execution loop,
 * managing breakpoints, statement stepping, call stack inspection, and evaluation.
 */

import * as fs from "fs";
import * as path from "path";
import {
  DapTransport,
  DapRequest,
  Breakpoint,
  StackFrame,
  Scope,
  Variable,
} from "./dap-protocol.js";
import { VM, VmDebugger } from "../vm/vm.js";
import { Chunk, formatValue } from "../bytecode/chunk.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { Compiler } from "../bytecode/compiler.js";
import { ErrorReporter } from "../errors/index.js";

type SteppingMode = "none" | "stepIn" | "stepOver" | "stepOut";

export class DebugSession implements VmDebugger {
  private transport: DapTransport;
  private vm: VM | null = null;
  private currentChunk: Chunk | null = null;
  private programPath = "";
  private breakpoints: Map<string, Set<number>> = new Map();

  // Stepping state
  private steppingMode: SteppingMode = "none";
  private stepStartLine = -1;
  private stepTargetDepth = -1;
  private stopOnEntry = false;
  private executionStarted = false;

  constructor(transport: DapTransport) {
    this.transport = transport;
    this.transport.onMessage((msg) => {
      if (msg.type === "request") {
        this.handleRequest(msg as DapRequest);
      }
    });
  }

  public handleRequest(req: DapRequest): void {
    switch (req.command) {
      case "initialize":
        this.transport.sendResponse(req, true, {
          supportsConfigurationDoneRequest: true,
          supportsConditionalBreakpoints: true,
          supportsEvaluateForHovers: true,
          supportsStepBack: false,
        });
        this.transport.sendEvent("initialized");
        break;

      case "launch":
        this.programPath = path.resolve(req.arguments?.program || "");
        this.stopOnEntry = !!req.arguments?.stopOnEntry;

        if (!fs.existsSync(this.programPath)) {
          this.transport.sendResponse(req, false, null, `File not found: ${this.programPath}`);
          return;
        }

        try {
          const src = fs.readFileSync(this.programPath, "utf-8");
          const reporter = new ErrorReporter(src, this.programPath);
          const lexer = new Lexer(src, this.programPath, reporter);
          const tokens = lexer.tokenize();
          const parser = new Parser(tokens, src, this.programPath, reporter);
          const ast = parser.parse();

          if (reporter.hasErrors()) {
            const firstErr = reporter.getErrors()[0];
            this.transport.sendResponse(req, false, null, `Compilation failed: ${firstErr.message}`);
            return;
          }

          const compiler = new Compiler(reporter);
          this.currentChunk = compiler.compile(ast);
          this.vm = new VM();
          this.vm.setDebugger(this);

          this.transport.sendResponse(req, true);
        } catch (err: any) {
          this.transport.sendResponse(req, false, null, `Launch failed: ${err.message}`);
        }
        break;

      case "setBreakpoints": {
        const filePath = path.resolve(req.arguments?.source?.path || "");
        const lines: number[] = (req.arguments?.breakpoints || []).map((b: any) => b.line);

        this.breakpoints.set(filePath, new Set(lines));

        const verifiedBps: Breakpoint[] = lines.map((line) => ({
          verified: true,
          line,
          source: { path: filePath },
        }));

        this.transport.sendResponse(req, true, { breakpoints: verifiedBps });
        break;
      }

      case "configurationDone":
        this.transport.sendResponse(req, true);
        this.startOrResume();
        break;

      case "threads":
        this.transport.sendResponse(req, true, {
          threads: [{ id: 1, name: "HKD Main Thread" }],
        });
        break;

      case "stackTrace": {
        if (!this.vm) {
          this.transport.sendResponse(req, true, { stackFrames: [], totalFrames: 0 });
          return;
        }

        const rawFrames = this.vm.getCallFrames();
        const stackFrames: StackFrame[] = rawFrames.map((f, i) => {
          let displayName = f.name;
          if (f.name === "__step__") {
            const parent = rawFrames[i - 1];
            displayName = parent && parent.name && parent.name !== "<script>" ? `${parent.name} (async)` : "async fn";
          }
          return {
            id: i,
            name: displayName,
            source: { path: this.programPath, name: path.basename(this.programPath) },
            line: f.line > 0 ? f.line : 1,
            column: 1,
          };
        });

        this.transport.sendResponse(req, true, {
          stackFrames: stackFrames.reverse(), // Top-of-stack first
          totalFrames: stackFrames.length,
        });
        break;
      }

      case "scopes": {
        const frameId = req.arguments?.frameId ?? 0;
        const scopes: Scope[] = [
          { name: "Locals", variablesReference: 1000 + frameId, expensive: false },
          { name: "Globals", variablesReference: 2000, expensive: false },
        ];
        this.transport.sendResponse(req, true, { scopes });
        break;
      }

      case "variables": {
        const varRef = req.arguments?.variablesReference ?? 0;
        const variables: Variable[] = [];

        if (this.vm) {
          if (varRef >= 1000 && varRef < 2000) {
            // Local variables
            const frameId = varRef - 1000;
            const locals = this.vm.getFrameLocals(frameId);
            for (const loc of locals) {
              if (
                loc.name.startsWith("__fut_") ||
                loc.name.startsWith("__await_") ||
                loc.name === "__resume_val__" ||
                loc.name === "__state__" ||
                loc.name === "__step__"
              ) {
                continue; // Filter internal synthetic compiler state-machine variables
              }
              variables.push({
                name: loc.name === "__future__" ? "<future>" : loc.name,
                value: formatValue(loc.value),
                variablesReference: 0,
              });
            }
          } else if (varRef === 2000) {
            // Global variables
            const globals = this.vm.getAllGlobals();
            for (const g of globals) {
              variables.push({
                name: g.name,
                value: formatValue(g.value),
                variablesReference: 0,
              });
            }
          }
        }

        this.transport.sendResponse(req, true, { variables });
        break;
      }

      case "continue":
        this.steppingMode = "none";
        this.transport.sendResponse(req, true, { allThreadsContinued: true });
        this.startOrResume();
        break;

      case "next": {
        // Step over
        if (this.vm) {
          const frames = this.vm.getCallFrames();
          this.stepTargetDepth = frames.length;
          this.stepStartLine = frames[frames.length - 1]?.line || -1;
          this.steppingMode = "stepOver";
        }
        this.transport.sendResponse(req, true);
        this.startOrResume();
        break;
      }

      case "stepIn": {
        // Step into
        if (this.vm) {
          const frames = this.vm.getCallFrames();
          this.stepStartLine = frames[frames.length - 1]?.line || -1;
          this.steppingMode = "stepIn";
        }
        this.transport.sendResponse(req, true);
        this.startOrResume();
        break;
      }

      case "stepOut": {
        // Step out
        if (this.vm) {
          const frames = this.vm.getCallFrames();
          this.stepTargetDepth = frames.length - 1;
          this.steppingMode = "stepOut";
        }
        this.transport.sendResponse(req, true);
        this.startOrResume();
        break;
      }

      case "evaluate": {
        const expr = (req.arguments?.expression || "").trim();
        let result = "null";

        if (this.vm) {
          // Check if it's a global
          const globVal = this.vm.getGlobal(expr);
          if (globVal !== undefined) {
            result = formatValue(globVal);
          } else {
            // Check numeric literal
            const num = Number(expr);
            if (!isNaN(num)) result = String(num);
            else result = `"<evaluated: ${expr}>"`;
          }
        }

        this.transport.sendResponse(req, true, {
          result,
          variablesReference: 0,
        });
        break;
      }

      case "disconnect":
        this.transport.sendResponse(req, true);
        this.transport.sendEvent("terminated");
        break;

      default:
        this.transport.sendResponse(req, false, null, `Unknown command: ${req.command}`);
        break;
    }
  }

  private lastPausedLine = -1;
  private skipCurrentLineBreakpoint = false;

  // ─── VmDebugger hook ────────────────────────────────────────────────────────

  public onBeforeInstruction(
    _vm: VM,
    _frame: any,
    _op: number,
    line: number
  ): "pause" | "continue" | void {
    if (line <= 0) return "continue";

    if (this.skipCurrentLineBreakpoint) {
      if (line === this.lastPausedLine) {
        return "continue";
      } else {
        this.skipCurrentLineBreakpoint = false;
      }
    }

    // 1. Check line breakpoint
    const bps = this.breakpoints.get(this.programPath);
    if (bps && bps.has(line)) {
      this.steppingMode = "none";
      this.lastPausedLine = line;
      this.transport.sendEvent("stopped", {
        reason: "breakpoint",
        threadId: 1,
        allThreadsStopped: true,
      });
      return "pause";
    }

    // 2. Check stepping modes
    if (this.steppingMode === "stepIn") {
      if (line !== this.stepStartLine) {
        this.steppingMode = "none";
        this.transport.sendEvent("stopped", {
          reason: "step",
          threadId: 1,
          allThreadsStopped: true,
        });
        return "pause";
      }
    } else if (this.steppingMode === "stepOver") {
      const currentDepth = this.vm?.getCallFrames().length || 1;
      if (currentDepth <= this.stepTargetDepth && line !== this.stepStartLine) {
        this.steppingMode = "none";
        this.transport.sendEvent("stopped", {
          reason: "step",
          threadId: 1,
          allThreadsStopped: true,
        });
        return "pause";
      }
    } else if (this.steppingMode === "stepOut") {
      const currentDepth = this.vm?.getCallFrames().length || 1;
      if (currentDepth <= this.stepTargetDepth) {
        this.steppingMode = "none";
        this.transport.sendEvent("stopped", {
          reason: "step",
          threadId: 1,
          allThreadsStopped: true,
        });
        return "pause";
      }
    }

    return "continue";
  }

  private hasRunStarted = false;

  private startOrResume(): void {
    if (!this.vm || !this.currentChunk) return;

    if (!this.executionStarted) {
      this.executionStarted = true;
      if (this.stopOnEntry) {
        this.transport.sendEvent("stopped", {
          reason: "entry",
          threadId: 1,
          allThreadsStopped: true,
        });
        return;
      }
    }

    if (!this.hasRunStarted) {
      this.hasRunStarted = true;
      const res = this.vm.run(this.currentChunk);
      if (!this.vm.isPaused) {
        this.transport.sendEvent("terminated");
        this.transport.sendEvent("exited", { exitCode: res.ok ? 0 : 1 });
      }
    } else {
      this.skipCurrentLineBreakpoint = true;
      const res = this.vm.resume();
      if (!this.vm.isPaused) {
        this.transport.sendEvent("terminated");
        this.transport.sendEvent("exited", { exitCode: res.ok ? 0 : 1 });
      }
    }
  }
}
