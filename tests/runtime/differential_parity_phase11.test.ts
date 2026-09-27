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
    isNativeRunnable = probe.status === 0;
  }
} catch {}

const TEMP_FILE = path.resolve(process.cwd(), "temp_test_parity11.hkdb");

function runDifferential(source: string): { refLines: string[]; nativeLines: string[] } {
  // 1. Reference VM
  const refLines: string[] = [];
  const refResult = runSource(source, {
    fileName: "<parity_test>",
    output: (s) => refLines.push(s.trim()),
    printDiagnostics: false,
  });
  expect(refResult.ok).toBe(true);

  // 2. Native Stack VM
  let nativeLines: string[] = [];
  if (!isNativeRunnable) {
    return { refLines, nativeLines: refLines };
  }
  try {
    const reporter = new ErrorReporter(source, "<parity_test>");
    const lexer = new Lexer(source, "<parity_test>", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, "<parity_test>", reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const binary = serializeProgram(chunk);
    fs.writeFileSync(TEMP_FILE, binary);

    const res = spawnSync(RUNTIME_PATH, [TEMP_FILE], { encoding: "utf-8" });
    expect(res.status).toBe(0);
    if (res.stdout) {
      nativeLines = res.stdout.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    }
  } finally {
    if (fs.existsSync(TEMP_FILE)) {
      fs.unlinkSync(TEMP_FILE);
    }
  }

  return { refLines, nativeLines };
}

describe("HKD Phase 11 — Differential Parity across Execution Tiers", () => {
  test("Arithmetic & loop parity across Reference VM and Native Stack VM", () => {
    const source = `
      fn compute() {
        let sum = 0;
        let i = 1;
        while i <= 100 {
          sum = sum + i * 2;
          i = i + 1;
        }
        return sum;
      }
      print(compute());
    `;

    const { refLines, nativeLines } = runDifferential(source);
    expect(nativeLines).toEqual(["10100"]);
    expect(refLines).toEqual(nativeLines);
  });

  test("Object property access and mutation parity across execution tiers", () => {
    const source = `
      let point = { x: 15, y: 25 };
      point.x = point.x + 10;
      let total = point.x + point.y;
      print(total);
    `;

    const { refLines, nativeLines } = runDifferential(source);
    expect(nativeLines).toEqual(["50"]);
    expect(refLines).toEqual(nativeLines);
  });

  test("Recursion parity (Fibonacci) across Reference and Native VM", () => {
    const source = `
      fn fib(n) {
        if (n <= 1) { return n; }
        return fib(n - 1) + fib(n - 2);
      }
      print(fib(12));
    `;

    const { refLines, nativeLines } = runDifferential(source);
    expect(nativeLines).toEqual(["144"]);
    expect(refLines).toEqual(nativeLines);
  });
});
