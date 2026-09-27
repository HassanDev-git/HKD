/**
 * HKD Bytecode Compatibility & Header Verification (tests/bytecode/bytecode_compat.test.ts)
 *
 * Validates `.hkdb` binary header layout, magic bytes ("HKDB"), format version 1,
 * and rejection of corrupt/incompatible bytecode streams as specified in docs/bytecode-format.md.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { Chunk } from "../../src/bytecode/chunk.js";
import { Op } from "../../src/bytecode/opcodes.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { ErrorReporter } from "../../src/errors/index.js";

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

describe("HKD 1.0 Bytecode Format & Compatibility Verification", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-bytecode-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("valid bytecode program has 8-byte header starting with HKDB", () => {
    const chunk = new Chunk("<main>", 0);
    chunk.writeByte(Op.LoadTrue, 1);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    expect(buf.length).toBeGreaterThanOrEqual(8);
    expect(buf.toString("ascii", 0, 4)).toBe("HKDB");
    expect(buf.readUInt8(4)).toBe(1); // format version
    expect(buf.readUInt8(5)).toBe(0); // language major
    expect(buf.readUInt8(6)).toBe(1); // language minor
    expect(buf.readUInt8(7)).toBe(1); // ABI version
  });

  test("native runtime rejects bytecode with invalid magic bytes", () => {
    if (!isNativeRunnable) return;

    const chunk = new Chunk("<main>", 0);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);
    buf.write("NOPE", 0, "ascii"); // corrupt magic bytes

    const testFile = path.join(tmpDir, "bad_magic.hkdb");
    fs.writeFileSync(testFile, buf);

    const res = spawnSync(RUNTIME_PATH, [testFile], { encoding: "utf-8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("magic must be 'HKDB'");
  });

  test("native runtime rejects unsupported bytecode version", () => {
    if (!isNativeRunnable) return;

    const chunk = new Chunk("<main>", 0);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);
    buf.writeUInt8(99, 4); // unsupported format version

    const testFile = path.join(tmpDir, "bad_version.hkdb");
    fs.writeFileSync(testFile, buf);

    const res = spawnSync(RUNTIME_PATH, [testFile], { encoding: "utf-8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("unsupported HKDB bytecode version 99");
  });

  test("native runtime rejects truncated bytecode shorter than 8 bytes", () => {
    if (!isNativeRunnable) return;

    const testFile = path.join(tmpDir, "truncated.hkdb");
    fs.writeFileSync(testFile, Buffer.from("HKD")); // only 3 bytes

    const res = spawnSync(RUNTIME_PATH, [testFile], { encoding: "utf-8" });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toContain("malformed bytecode header");
  });

  test("constant pool serialization faithfully roundtrips in native runtime", () => {
    if (!isNativeRunnable) return;

    const source = 'print("Hello from Constant Pool")';
    const reporter = new ErrorReporter(source, "<compat>");
    const lexer = new Lexer(source, "<compat>", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, "<compat>", reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const buf = serializeProgram(chunk);
    const testFile = path.join(tmpDir, "constants.hkdb");
    fs.writeFileSync(testFile, buf);

    const res = spawnSync(RUNTIME_PATH, [testFile], { encoding: "utf-8" });
    expect(res.status).toBe(0);
    expect(res.stdout.trim()).toBe("Hello from Constant Pool");
  });
});
