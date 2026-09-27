"use strict";
/**
 * HKD Debug Session & Runtime Debug Controller
 *
 * Bridges VS Code DAP requests directly to the HKD Stack VM execution loop,
 * managing breakpoints, statement stepping, call stack inspection, and evaluation.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DebugSession = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vm_js_1 = require("../vm/vm.js");
const chunk_js_1 = require("../bytecode/chunk.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const compiler_js_1 = require("../bytecode/compiler.js");
const index_js_1 = require("../errors/index.js");
class DebugSession {
    transport;
    vm = null;
    currentChunk = null;
    programPath = "";
    breakpoints = new Map();
    // Stepping state
    steppingMode = "none";
    stepStartLine = -1;
    stepTargetDepth = -1;
    stopOnEntry = false;
    executionStarted = false;
    constructor(transport) {
        this.transport = transport;
        this.transport.onMessage((msg) => {
            if (msg.type === "request") {
                this.handleRequest(msg);
            }
        });
    }
    handleRequest(req) {
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
                    const reporter = new index_js_1.ErrorReporter(src, this.programPath);
                    const lexer = new lexer_js_1.Lexer(src, this.programPath, reporter);
                    const tokens = lexer.tokenize();
                    const parser = new parser_js_1.Parser(tokens, src, this.programPath, reporter);
                    const ast = parser.parse();
                    if (reporter.hasErrors()) {
                        const firstErr = reporter.getErrors()[0];
                        this.transport.sendResponse(req, false, null, `Compilation failed: ${firstErr.message}`);
                        return;
                    }
                    const compiler = new compiler_js_1.Compiler(reporter);
                    this.currentChunk = compiler.compile(ast);
                    this.vm = new vm_js_1.VM();
                    this.vm.setDebugger(this);
                    this.transport.sendResponse(req, true);
                }
                catch (err) {
                    this.transport.sendResponse(req, false, null, `Launch failed: ${err.message}`);
                }
                break;
            case "setBreakpoints": {
                const filePath = path.resolve(req.arguments?.source?.path || "");
                const lines = (req.arguments?.breakpoints || []).map((b) => b.line);
                this.breakpoints.set(filePath, new Set(lines));
                const verifiedBps = lines.map((line) => ({
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
                const stackFrames = rawFrames.map((f, i) => ({
                    id: i,
                    name: f.name,
                    source: { path: this.programPath, name: path.basename(this.programPath) },
                    line: f.line > 0 ? f.line : 1,
                    column: 1,
                }));
                this.transport.sendResponse(req, true, {
                    stackFrames: stackFrames.reverse(), // Top-of-stack first
                    totalFrames: stackFrames.length,
                });
                break;
            }
            case "scopes": {
                const frameId = req.arguments?.frameId ?? 0;
                const scopes = [
                    { name: "Locals", variablesReference: 1000 + frameId, expensive: false },
                    { name: "Globals", variablesReference: 2000, expensive: false },
                ];
                this.transport.sendResponse(req, true, { scopes });
                break;
            }
            case "variables": {
                const varRef = req.arguments?.variablesReference ?? 0;
                const variables = [];
                if (this.vm) {
                    if (varRef >= 1000 && varRef < 2000) {
                        // Local variables
                        const frameId = varRef - 1000;
                        const locals = this.vm.getFrameLocals(frameId);
                        for (const loc of locals) {
                            variables.push({
                                name: loc.name,
                                value: (0, chunk_js_1.formatValue)(loc.value),
                                variablesReference: 0,
                            });
                        }
                    }
                    else if (varRef === 2000) {
                        // Global variables
                        const globals = this.vm.getAllGlobals();
                        for (const g of globals) {
                            variables.push({
                                name: g.name,
                                value: (0, chunk_js_1.formatValue)(g.value),
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
                        result = (0, chunk_js_1.formatValue)(globVal);
                    }
                    else {
                        // Check numeric literal
                        const num = Number(expr);
                        if (!isNaN(num))
                            result = String(num);
                        else
                            result = `"<evaluated: ${expr}>"`;
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
    lastPausedLine = -1;
    skipCurrentLineBreakpoint = false;
    // ─── VmDebugger hook ────────────────────────────────────────────────────────
    onBeforeInstruction(_vm, _frame, _op, line) {
        if (line <= 0)
            return "continue";
        if (this.skipCurrentLineBreakpoint) {
            if (line === this.lastPausedLine) {
                return "continue";
            }
            else {
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
        }
        else if (this.steppingMode === "stepOver") {
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
        }
        else if (this.steppingMode === "stepOut") {
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
    hasRunStarted = false;
    startOrResume() {
        if (!this.vm || !this.currentChunk)
            return;
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
        }
        else {
            this.skipCurrentLineBreakpoint = true;
            const res = this.vm.resume();
            if (!this.vm.isPaused) {
                this.transport.sendEvent("terminated");
                this.transport.sendEvent("exited", { exitCode: res.ok ? 0 : 1 });
            }
        }
    }
}
exports.DebugSession = DebugSession;
//# sourceMappingURL=debug-session.js.map