import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { runFile } from "../../src/runtime/index.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { ErrorReporter } from "../../src/errors/index.js";

describe("HKD Phase 12AB — Differential Testing with Packages & Modules", () => {
  const testDir = path.resolve(".hkd/test_differential_p12");
  const RUNTIME_BIN = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
  const nativeRuntime = path.resolve("native-runtime/zig-out/bin", RUNTIME_BIN);
  if (process.platform !== "win32" && fs.existsSync(nativeRuntime)) {
    try { fs.chmodSync(nativeRuntime, 0o755); } catch {}
  }

  beforeAll(() => {
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {}
  });

  function compileSource(src: string, outPath: string) {
    const reporter = new ErrorReporter(src, outPath);
    const lexer = new Lexer(src, outPath, reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, src, outPath, reporter);
    const ast = parser.parse();
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const binary = serializeProgram(chunk);
    fs.writeFileSync(outPath, binary);
  }

  test("Differential parity between Stack VM, JIT, and Native VM", () => {
    const src = `
      fn compute(n) {
        let acc = 0;
        let i = 0;
        while (i < n) {
          acc = acc + i * 2;
          i = i + 1;
        }
        return acc;
      }
      print(compute(100));
    `;

    const hkdPath = path.join(testDir, "test.hkd");
    const hkdbPath = path.join(testDir, "test.hkdb");
    fs.writeFileSync(hkdPath, src, "utf-8");
    compileSource(src, hkdbPath);

    // 1. Reference Stack VM
    let refOutput = "";
    const origWrite = process.stdout.write;
    process.stdout.write = ((chunk: any) => {
      refOutput += String(chunk);
      return true;
    }) as any;
    try {
      runFile(hkdPath);
    } finally {
      process.stdout.write = origWrite;
    }

    expect(refOutput.trim()).toBe("9900");

    // 2. Native Stack VM / JIT if available
    let isNativeRunnable = false;
    try {
      if (fs.existsSync(nativeRuntime)) {
        const probe = spawnSync(nativeRuntime, ["--help"], { encoding: "utf-8" });
        isNativeRunnable = probe.status === 0 || (probe.stderr || "").includes("HKD") || (probe.stdout || "").includes("HKD");
      }
    } catch {}

    if (isNativeRunnable) {
      // Standard VM
      const vmRes = spawnSync(nativeRuntime, [hkdbPath, "--vm"], { encoding: "utf-8" });
      expect(vmRes.status).toBe(0);
      expect(vmRes.stdout.trim()).toBe("9900");

      // JIT Engine
      const jitRes = spawnSync(nativeRuntime, [hkdbPath, "--jit"], { encoding: "utf-8" });
      expect(jitRes.status).toBe(0);
      expect(jitRes.stdout.trim()).toBe("9900");

      // Differential Parity check
      expect(vmRes.stdout.trim()).toBe(jitRes.stdout.trim());
      expect(jitRes.stdout.trim()).toBe(refOutput.trim());
    }
  });
});
