import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";

const RUNTIME_BIN = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
const RUNTIME_PATH = path.resolve(__dirname, "../../native-runtime/zig-out/bin", RUNTIME_BIN);
if (process.platform !== "win32" && fs.existsSync(RUNTIME_PATH)) {
  try { fs.chmodSync(RUNTIME_PATH, 0o755); } catch {}
}

let isNativeRunnable = false;
try {
  if (fs.existsSync(RUNTIME_PATH)) {
    const probe = spawnSync(RUNTIME_PATH, ["--help"], { encoding: "utf-8" });
    isNativeRunnable = probe.status === 0 || (probe.stderr || "").includes("HKD") || (probe.stdout || "").includes("HKD");
  }
} catch {}

const TEMP_FILE = path.resolve(process.cwd(), "temp_test_tco.hkdb");

function run(source: string): { output: string[]; ok: boolean } {
  const lines: string[] = [];
  const result = runSource(source, {
    fileName: "<test>",
    output: (s) => lines.push(s),
    printDiagnostics: false,
  });

  let nativeLines: string[] = [];
  let nativeOk = false;

  try {
    const reporter = new ErrorReporter(source, "<test>");
    const lexer = new Lexer(source, "<test>", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, "<test>", reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const binary = serializeProgram(chunk);
    fs.writeFileSync(TEMP_FILE, binary);

    const res = spawnSync(RUNTIME_PATH, [TEMP_FILE], { encoding: "utf-8" });
    if (res.status === 0) {
      nativeOk = true;
      if (res.stdout) {
        nativeLines = res.stdout.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      }
    }
  } finally {
    if (fs.existsSync(TEMP_FILE)) {
      fs.unlinkSync(TEMP_FILE);
    }
  }

  if (result.ok && isNativeRunnable) {
    expect(nativeOk).toBe(true);
    const stdLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    expect(nativeLines).toEqual(stdLines);
  }

  return { output: lines, ok: result.ok };
}

describe("Phase 9E — Function & Call Optimization (TCO)", () => {
  test("Self-tail call executes in O(1) stack depth without stack overflow", () => {
    // 5000 iterations would exceed MAX_CALL_DEPTH (512 or 256) without TCO
    const script = `
      fn sum_tail(n, acc) {
        if (n <= 0) {
          return acc
        }
        return sum_tail(n - 1, acc + n)
      }
      print(sum_tail(1000, 0))
    `;

    const { output, ok } = run(script);
    expect(ok).toBe(true);
    // 1000 * 1001 / 2 = 500500
    expect(output[0]).toBe("500500");
  });

  test("Tail-recursive countdown correctly terminates", () => {
    const script = `
      fn countdown(n) {
        if (n <= 0) {
          return "done"
        }
        return countdown(n - 1)
      }
      print(countdown(2000))
    `;

    const { output, ok } = run(script);
    expect(ok).toBe(true);
    expect(output[0]).toBe("done");
  });
});
