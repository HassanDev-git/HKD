import { describe, test, expect } from "@jest/globals";
import {
  ControlFlowGraph,
  validateMIR,
  validateSSA,
  validateUses,
  validateTerminators,
  IRValidationError,
} from "../../src/ir/mir.js";
import { Chunk } from "../../src/bytecode/chunk.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

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

describe("HKD Phase 10U — Fuzzing and Invariant Verification", () => {
  test("SSA validator rejects illegal CFG cycles with invalid terminator", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    cfg.entryBlockId = b0.id;

    // Terminator targets non-existent block 9999
    b0.terminator = {
      kind: "CondBranch",
      cond: { kind: "Const", value: true },
      thenTarget: 9999,
      elseTarget: b0.id,
    };

    expect(() => validateTerminators(cfg)).toThrow(IRValidationError);
  });

  test("SSA validator rejects phi node with missing incoming branch", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    const b1 = cfg.allocBlock("target");
    cfg.entryBlockId = b0.id;

    cfg.addEdge(b0.id, b1.id);
    const dest = cfg.allocVReg();

    // Phi node references non-existent block 8888
    b1.instructions.push({
      kind: "Phi",
      dst: dest,
      incoming: [
        { blockId: b0.id, operand: { kind: "Reg", reg: cfg.allocVReg() } },
        { blockId: 8888, operand: { kind: "Reg", reg: cfg.allocVReg() } },
      ],
    });
    b1.terminator = { kind: "Return" };

    expect(() => validateUses(cfg)).toThrow(IRValidationError);
  });

  test("Fuzzer: mutated bytecode never causes native crash or segfault", () => {
    if (!isNativeRunnable) return;
    const chunk = new Chunk("fuzz_target", 0);
    chunk.localCount = 2;
    chunk.code = [0x01, 0x00, 0x01, 0x00, 0x04, 0xFF]; // LoadConst 0, LoadConst 0, Add, Halt
    chunk.lines = [1, 1, 1, 1, 1, 1];
    chunk.constants = [42];
    const baseBuffer = serializeProgram(chunk);

    // Perform 30 random byte mutations
    for (let iteration = 0; iteration < 30; iteration++) {
      const mutated = Buffer.from(baseBuffer);
      const mutateIdx = Math.floor(Math.random() * mutated.length);
      mutated[mutateIdx] = Math.floor(Math.random() * 256);

      const tempFile = path.resolve(process.cwd(), `temp_fuzz_${iteration}.hkdb`);
      fs.writeFileSync(tempFile, mutated);

      try {
        const res = spawnSync(RUNTIME_PATH, [tempFile], { encoding: "utf-8" });
        // The process must exit cleanly with error code (1 or 2) or succeed, but NEVER segfault/crash (exit code null / signal)
        expect(res.signal).toBeNull();
        expect(typeof res.status).toBe("number");
      } finally {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      }
    }
  });
});
