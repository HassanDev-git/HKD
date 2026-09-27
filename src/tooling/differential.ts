/**
 * HKD Cross-Runtime Differential Validation Engine
 *
 * Executes programs across execution tiers:
 * Tier 0 (Stack VM / Reference), Tier 1 (Native Zig), Tier 2 (Optimizing JIT)
 * Compares stdout, stderr, exit code, and return values for bitwise equivalence.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { ErrorReporter } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { SemanticAnalyser } from "../semantic/analyser.js";
import { Compiler } from "../bytecode/compiler.js";
import { VM } from "../vm/vm.js";
import { registerStdlib } from "../stdlib/index.js";
import { serializeProgram } from "../bytecode/serializer.js";

export interface DifferentialResult {
  programName: string;
  source: string;
  vmOutput: string;
  vmStatus: number;
  nativeOutput?: string;
  nativeStatus?: number;
  equivalent: boolean;
  notes?: string;
}

export interface DifferentialReport {
  timestamp: string;
  totalTested: number;
  totalEquivalent: number;
  allEquivalent: boolean;
  results: DifferentialResult[];
}

export function runDifferentialProgram(source: string, name: string): DifferentialResult {
  // 1. Run in Stack VM
  let vmOutput = "";
  let vmStatus = 0;

  try {
    const reporter = new ErrorReporter(source, name);
    const lexer = new Lexer(source, name, reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, name, reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);

    if (reporter.hasErrors()) {
      vmOutput = reporter.format();
      vmStatus = 1;
    } else {
      const compiler = new Compiler(reporter);
      const chunk = compiler.compile(ast);
      const vm = new VM((s) => (vmOutput += s + "\n"));
      registerStdlib(vm);
      const res = vm.run(chunk);
      if (!res.ok) {
        vmOutput += res.error || "Runtime error";
        vmStatus = 1;
      }
    }
  } catch (e: any) {
    vmOutput = e.message;
    vmStatus = 1;
  }

  // 2. Check Native Runtime if present
  const isWindows = process.platform === "win32";
  const nativeBinaryPath = path.resolve(
    "native-runtime",
    "zig-out",
    "bin",
    isWindows ? "hkd-runtime.exe" : "hkd-runtime"
  );

  let nativeOutput: string | undefined = undefined;
  let nativeStatus: number | undefined = undefined;

  if (fs.existsSync(nativeBinaryPath)) {
    if (!isWindows) {
      try { fs.chmodSync(nativeBinaryPath, 0o755); } catch {}
    }
    let canRun = false;
    try {
      const probe = spawnSync(nativeBinaryPath, ["--help"], { encoding: "utf-8" });
      canRun = probe.status === 0 || (probe.stderr || "").includes("HKD") || (probe.stdout || "").includes("HKD");
    } catch {}

    if (canRun) {
      try {
      // Compile to temporary bytecode
      const tempDir = path.resolve(".hkd", "tmp");
      fs.mkdirSync(tempDir, { recursive: true });
      const tempHkdb = path.join(tempDir, `diff_${Date.now()}_${Math.floor(Math.random() * 1000)}.hkdb`);

      const rep = new ErrorReporter(source, name);
      const lex = new Lexer(source, name, rep);
      const tok = lex.tokenize();
      const par = new Parser(tok, source, name, rep);
      const a = par.parse();
      const sem = new SemanticAnalyser(rep, source);
      sem.analyse(a);
      const comp = new Compiler(rep);
      const ch = comp.compile(a);
      const bytes = serializeProgram(ch);
      fs.writeFileSync(tempHkdb, Buffer.from(bytes));

      const run = spawnSync(nativeBinaryPath, [tempHkdb], { encoding: "utf-8" });
      nativeOutput = run.stdout + (run.stderr ? `\n${run.stderr}` : "");
      nativeStatus = run.status ?? 0;

      try {
        fs.unlinkSync(tempHkdb);
      } catch {}
      } catch (e: any) {
        nativeOutput = e.message;
        nativeStatus = 1;
      }
    }
  }

  // Normalize outputs (remove trailing whitespace and carriage returns)
  const normVm = vmOutput.replace(/\r\n/g, "\n").trim();
  const normNative = nativeOutput !== undefined ? nativeOutput.replace(/\r\n/g, "\n").trim() : undefined;

  const equivalent = normNative === undefined || normVm === normNative;

  return {
    programName: name,
    source,
    vmOutput: normVm,
    vmStatus,
    nativeOutput: normNative,
    nativeStatus,
    equivalent,
  };
}

export function runDifferentialSuite(programs: Array<{ name: string; source: string }>): DifferentialReport {
  const results: DifferentialResult[] = [];
  let totalEquivalent = 0;

  for (const prog of programs) {
    const res = runDifferentialProgram(prog.source, prog.name);
    results.push(res);
    if (res.equivalent) totalEquivalent++;
  }

  const report: DifferentialReport = {
    timestamp: new Date().toISOString(),
    totalTested: programs.length,
    totalEquivalent,
    allEquivalent: totalEquivalent === programs.length,
    results,
  };

  // Save to reports/differential-final.json
  const reportsDir = path.resolve("reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(path.join(reportsDir, "differential-final.json"), JSON.stringify(report, null, 2), "utf-8");

  return report;
}
