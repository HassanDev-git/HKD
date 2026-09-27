/**
 * HKD Bytecode Safety & Robustness Test Suite
 * (tests/bytecode/bytecode_safety.test.ts)
 *
 * Validates that the runtime cleanly and safely rejects corrupted, truncated,
 * invalid magic, and unsupported version bytecode without crashes or panics.
 */

import { Chunk } from "../../src/bytecode/chunk.js";
import { Op } from "../../src/bytecode/opcodes.js";
import { serializeProgram, deserializeProgram } from "../../src/bytecode/serializer.js";
import { VM } from "../../src/vm/vm.js";

describe("HKD Bytecode Safety & Invariant Rejection", () => {
  test("BC-SAFE-01: Valid program serializes, deserializes and executes cleanly", () => {
    const chunk = new Chunk("test_valid", 0);
    chunk.writeByte(Op.LoadTrue, 1);
    chunk.writeByte(Op.Return, 1);

    const buf = serializeProgram(chunk);
    const deserialized = deserializeProgram(buf);

    expect(deserialized.name).toBe("test_valid");
    expect(deserialized.code.length).toBe(2);

    const vm = new VM();
    const result = vm.run(deserialized);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(true);
    }
  });

  test("BC-SAFE-02: Safely rejects truncated header buffers", () => {
    const emptyBuf = Buffer.alloc(0);
    expect(() => deserializeProgram(emptyBuf)).toThrow(/shorter than 8-byte header/);

    const shortBuf = Buffer.from("HKD");
    expect(() => deserializeProgram(shortBuf)).toThrow(/shorter than 8-byte header/);
  });

  test("BC-SAFE-03: Safely rejects invalid magic bytes", () => {
    const chunk = new Chunk("m", 0);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    buf.write("NOPE", 0, "ascii");
    expect(() => deserializeProgram(buf)).toThrow(/Invalid HKDB magic bytes/);
  });

  test("BC-SAFE-04: Safely rejects unsupported format version", () => {
    const chunk = new Chunk("m", 0);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    buf.writeUInt8(99, 4);
    expect(() => deserializeProgram(buf)).toThrow(/Unsupported HKDB bytecode format version: 99/);
  });

  test("BC-SAFE-05: Safely rejects truncated body buffers", () => {
    const chunk = new Chunk("m", 0);
    chunk.writeByte(Op.LoadTrue, 1);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    // Truncate halfway through the body
    const truncated = buf.subarray(0, 12);
    expect(() => deserializeProgram(truncated)).toThrow(/Corrupted HKDB bytecode/);
  });

  test("BC-SAFE-06: Safely rejects corrupted constant tag", () => {
    const chunk = new Chunk("m", 0);
    chunk.addConstant(42);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    // Corrupt constant pool tag at end of buffer
    buf.writeUInt8(0xfe, buf.length - 9); // tag byte before 8-byte float
    expect(() => deserializeProgram(buf)).toThrow(/Corrupted HKDB constant pool: unknown type tag/);
  });

  test("BC-SAFE-07: Safely handles out-of-bounds constant pool index at VM execution", () => {
    const chunk = new Chunk("oob_const", 0);
    // Op.LoadConst takes a 2-byte operand index
    chunk.writeByte(Op.LoadConst, 1);
    chunk.writeU16(999, 1); // Index 999 does not exist (pool is empty)
    chunk.writeByte(Op.Return, 1);

    const vm = new VM();
    const result = vm.run(chunk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  test("BC-SAFE-08: Safely handles illegal or unknown opcodes without unhandled crashes", () => {
    const chunk = new Chunk("illegal_op", 0);
    chunk.writeByte(0xfe as any, 1); // Illegal opcode byte
    chunk.writeByte(Op.Return, 1);

    const vm = new VM();
    const result = vm.run(chunk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeDefined();
    }
  });

  test("BC-SAFE-09: Corrupt string length in constant pool is rejected by deserializer", () => {
    const chunk = new Chunk("corrupt_str", 0);
    chunk.addConstant("hello world");
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    // Corrupt the string length to be gigantic (exceeding buffer size)
    // Find the string tag 0x04 in constant pool
    const strTagIdx = buf.indexOf(0x04);
    if (strTagIdx !== -1) {
      buf.writeUInt32LE(0x7fffffff, strTagIdx + 1);
      expect(() => deserializeProgram(buf)).toThrow(/Corrupted HKDB bytecode/);
    }
  });
});

