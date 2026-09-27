import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { Chunk } from "../../src/bytecode/chunk.js";

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

const TEMP_FILE = path.resolve(__dirname, "temp_corrupted.hkdb");

function runBytecode(buf: Buffer): { status: number | null; stderr: string; stdout: string } {
  fs.writeFileSync(TEMP_FILE, buf);
  const res = spawnSync(RUNTIME_PATH, [TEMP_FILE], { encoding: "utf-8" });
  if (fs.existsSync(TEMP_FILE)) {
    fs.unlinkSync(TEMP_FILE);
  }
  return {
    status: res.status,
    stderr: res.stderr || "",
    stdout: res.stdout || "",
  };
}

describe("HKD Bytecode Corruption and Validator Tests", () => {
  const testOrSkip = isNativeRunnable ? it : it.skip;
  let validBuffer: Buffer;

  beforeAll(() => {
    // Generate a valid minimal bytecode buffer
    const chunk = new Chunk("main", 0);
    chunk.localCount = 0;
    chunk.upvalueCount = 0;
    chunk.code = [0xFF]; // Halt
    chunk.lines = [1];
    chunk.constants = [];
    validBuffer = serializeProgram(chunk);
  });

  testOrSkip("should fail on truncated bytecode (less than 8 bytes)", () => {
    const truncated = validBuffer.subarray(0, 5);
    const res = runBytecode(truncated);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: malformed bytecode header");
  });

  testOrSkip("should fail on invalid magic bytes", () => {
    const invalidMagic = Buffer.from(validBuffer);
    invalidMagic.write("BADB", 0, "ascii");
    const res = runBytecode(invalidMagic);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: invalid file header");
  });

  testOrSkip("should fail on incompatible format version", () => {
    const invalidVersion = Buffer.from(validBuffer);
    invalidVersion.writeUInt8(9, 4); // version 9
    const res = runBytecode(invalidVersion);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: unsupported HKDB bytecode version 9");
    expect(res.stderr).toContain("runtime supports version 1");
  });

  testOrSkip("should fail on invalid opcode", () => {
    const chunk = new Chunk("main", 0);
    chunk.localCount = 0;
    chunk.upvalueCount = 0;
    chunk.code = [0xEE, 0xFF]; // 0xEE is invalid
    chunk.lines = [1, 1];
    chunk.constants = [];
    const invalidOp = serializeProgram(chunk);
    const res = runBytecode(invalidOp);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: bytecode validation failed");
  });

  testOrSkip("should fail on invalid local variable index", () => {
    const chunk = new Chunk("main", 0);
    chunk.localCount = 0;
    chunk.upvalueCount = 0;
    chunk.code = [0x10, 0x00, 0x05, 0xFF]; // LoadLocal 5 (but localCount is 0)
    chunk.lines = [1, 1, 1, 1];
    chunk.constants = [];
    const invalidLocal = serializeProgram(chunk);
    const res = runBytecode(invalidLocal);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: bytecode validation failed");
  });

  testOrSkip("should fail on invalid jump target (pointing out of bounds)", () => {
    const chunk = new Chunk("main", 0);
    chunk.localCount = 0;
    chunk.upvalueCount = 0;
    chunk.code = [0x50, 0x00, 0x64, 0xFF]; // Jump offset 100 (out of bounds)
    chunk.lines = [1, 1, 1, 1];
    chunk.constants = [];
    const invalidJump = serializeProgram(chunk);
    const res = runBytecode(invalidJump);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain("error: bytecode validation failed");
  });

  testOrSkip("fuzz test: random mutated byte buffers must exit gracefully without unhandled faults", () => {
    for (let iteration = 0; iteration < 20; iteration++) {
      const mutated = Buffer.from(validBuffer);
      const numMutations = 1 + (iteration % 4);
      for (let m = 0; m < numMutations; m++) {
        const offset = Math.floor(Math.random() * mutated.length);
        mutated[offset] = Math.floor(Math.random() * 256);
      }
      const res = runBytecode(mutated);
      expect(typeof res.status === "number").toBe(true);
    }
  });
});
