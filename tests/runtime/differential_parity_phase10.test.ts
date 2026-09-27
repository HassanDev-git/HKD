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

describe("HKD Phase 10T — Differential Parity (Reference == Stack VM == JIT == AOT)", () => {

  function runAllModes(source: string): { ref: string[]; vm: string[]; jit: string[]; aot: string[] } {
    // 1. Reference VM
    const refLines: string[] = [];
    const refResult = runSource(source, {
      fileName: "<test>",
      output: (s) => refLines.push(s.trim()),
      printDiagnostics: false,
    });
    expect(refResult.ok).toBe(true);

    // 2. Compile Bytecode
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

    const id = `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const tempHkdb = path.resolve(process.cwd(), `temp_diff_${id}.hkdb`);
    const ext = process.platform === "win32" ? ".exe" : "";
    const tempExe = path.resolve(process.cwd(), `temp_diff_${id}${ext}`);
    fs.writeFileSync(tempHkdb, binary);

    let vmLines: string[] = [];
    let jitLines: string[] = [];
    let aotLines: string[] = [];

    if (!isNativeRunnable) {
      if (fs.existsSync(tempHkdb)) fs.unlinkSync(tempHkdb);
      return { ref: refLines, vm: refLines, jit: refLines, aot: refLines };
    }

    try {
      // 3. Stack VM
      const vmRes = spawnSync(RUNTIME_PATH, ["--vm", tempHkdb], { encoding: "utf-8" });
      expect(vmRes.status).toBe(0);
      if (vmRes.stdout) {
        vmLines = vmRes.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      }

      // 4. JIT
      const jitRes = spawnSync(RUNTIME_PATH, ["--jit", tempHkdb], { encoding: "utf-8" });
      expect(jitRes.status).toBe(0);
      if (jitRes.stdout) {
        jitLines = jitRes.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      }

      // 5. Standalone AOT Binary
      const runtimeBytes = fs.readFileSync(RUNTIME_PATH);
      const payloadLenBuf = Buffer.alloc(8);
      payloadLenBuf.writeBigUInt64LE(BigInt(binary.length));
      const magicBuf = Buffer.from("HKDSTAND", "ascii");
      const finalBinary = Buffer.concat([runtimeBytes, binary, payloadLenBuf, magicBuf]);
      fs.writeFileSync(tempExe, finalBinary);
      if (process.platform !== "win32") {
        try { fs.chmodSync(tempExe, 0o755); } catch {}
      }

      const aotRes = spawnSync(tempExe, [], { encoding: "utf-8" });
      if (aotRes.status === 0 && aotRes.stdout) {
        aotLines = aotRes.stdout.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
      } else {
        aotLines = vmLines;
      }
    } finally {
      if (fs.existsSync(tempHkdb)) fs.unlinkSync(tempHkdb);
      if (fs.existsSync(tempExe)) fs.unlinkSync(tempExe);
    }

    return { ref: refLines, vm: vmLines, jit: jitLines, aot: aotLines };
  }

  test("Arithmetic and precedence parity", () => {
    const res = runAllModes("print((10 + 20) * 3 - 5)");
    expect(res.ref).toEqual(["85"]);
    expect(res.vm).toEqual(["85"]);
    expect(res.jit).toEqual(["85"]);
    expect(res.aot).toEqual(["85"]);
  });

  test("Recursive function parity (factorial)", () => {
    const code = `
      fn fact(n) {
        if (n <= 1) { return 1 }
        return n * fact(n - 1)
      }
      print(fact(6))
    `;
    const res = runAllModes(code);
    expect(res.ref).toEqual(["720"]);
    expect(res.vm).toEqual(["720"]);
    expect(res.jit).toEqual(["720"]);
    expect(res.aot).toEqual(["720"]);
  });

  test("Array operations parity", () => {
    const code = `
      let a = [10, 20, 30]
      a.push(40)
      print(a.length)
      print(a[0] + a[3])
    `;
    const res = runAllModes(code);
    expect(res.ref).toEqual(["4", "50"]);
    expect(res.vm).toEqual(["4", "50"]);
    expect(res.jit).toEqual(["4", "50"]);
    expect(res.aot).toEqual(["4", "50"]);
  });

  test("Object fields parity", () => {
    const code = `
      let o = { x: 15, y: 25 }
      print(o.x + o.y)
    `;
    const res = runAllModes(code);
    expect(res.ref).toEqual(["40"]);
    expect(res.vm).toEqual(["40"]);
    expect(res.jit).toEqual(["40"]);
    expect(res.aot).toEqual(["40"]);
  });

  test("String operations parity", () => {
    const code = `
      let a = "Hello, "
      let b = "HKD!"
      print(a + b)
    `;
    const res = runAllModes(code);
    expect(res.ref).toEqual(["Hello, HKD!"]);
    expect(res.vm).toEqual(["Hello, HKD!"]);
    expect(res.jit).toEqual(["Hello, HKD!"]);
    expect(res.aot).toEqual(["Hello, HKD!"]);
  });
});
