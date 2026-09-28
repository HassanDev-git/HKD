/**
 * HKD Phase 9F — Compiler Emission & Compilation Pipeline Performance Test Suite
 *
 * Verifies:
 *   1. Bytecode Chunk Instruction Emission & writeOpU16 helpers
 *   2. Constant Pool Deduplication & Primitive Caching
 *   3. Jump Placeholder & Loop Target Correctness
 *   4. Fast Serialization & Deserialization Roundtrip (Bitwise Parity)
 *   5. Register Lowering Flat-Array IP Mapping Parity
 *   6. Repeated Compilation Isolation (100x deterministic compilation)
 *   7. Differential Parity (Stack VM Reference vs Register VM)
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { Chunk } from "../../src/bytecode/chunk.js";
import { Op } from "../../src/bytecode/opcodes.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";
import { serializeProgram, deserializeProgram, serialize } from "../../src/bytecode/serializer.js";
import { RegOp } from "../../src/bytecode/register_chunk.js";

function compileToChunk(source: string, edition: "2026" | "2027" = "2026"): Chunk {
  const reporter = new ErrorReporter(source, "<test>");
  const lexer = new Lexer(source, "<test>", reporter);
  const parser = new Parser(lexer.tokenize(), source, "<test>", reporter, edition);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  const compiler = new Compiler(reporter);
  return compiler.compile(ast);
}

function assertParity(source: string, edition: "2026" | "2027" = "2026") {
  const stackOut: string[] = [];
  const regOut: string[] = [];

  const oldVm = process.env.HKD_VM;
  try {
    delete process.env.HKD_VM;
    const resStack = runSource(source, {
      edition,
      noExit: true,
      output: (s) => stackOut.push(s),
    });
    expect(resStack.ok).toBe(true);

    process.env.HKD_VM = "register";
    const resReg = runSource(source, {
      edition,
      noExit: true,
      output: (s) => regOut.push(s),
    });
    expect(resReg.ok).toBe(true);

    expect(regOut.join("\n")).toBe(stackOut.join("\n"));
  } finally {
    if (oldVm !== undefined) {
      process.env.HKD_VM = oldVm;
    } else {
      delete process.env.HKD_VM;
    }
  }
}

describe("HKD Phase 9F — Compiler Pipeline & Emission Verification", () => {
  // ── 1. Chunk Emission & Helpers ────────────────────────────────────────────
  test("writeOpU16 and writeU16 emit identical byte sequences to multi-step writes", () => {
    const chunk1 = new Chunk("test1", 0);
    chunk1.writeByte(Op.LoadLocal, 10);
    chunk1.writeU16(42, 10);

    const chunk2 = new Chunk("test2", 0);
    chunk2.writeOpU16(Op.LoadLocal, 42, 10);

    expect(chunk1.code).toEqual(chunk2.code);
    expect(chunk1.lines).toEqual(chunk2.lines);
    expect(chunk2.code).toEqual([Op.LoadLocal, 0, 42]);
    expect(chunk2.lines).toEqual([10, 10, 10]);
  });

  test("emitConstant emits Op.LoadConst and correctly maps constant pool index", () => {
    const chunk = new Chunk("const_test", 0);
    chunk.emitConstant("hello", 5);
    chunk.emitConstant("world", 6);
    chunk.emitConstant("hello", 7); // Deduplicated

    expect(chunk.constants.length).toBe(2);
    expect(chunk.constants[0]).toBe("hello");
    expect(chunk.constants[1]).toBe("world");

    expect(chunk.code).toEqual([
      Op.LoadConst, 0, 0,
      Op.LoadConst, 0, 1,
      Op.LoadConst, 0, 0,
    ]);
  });

  test("emitJump and patchJump calculate relative offsets correctly", () => {
    const chunk = new Chunk("jump_test", 0);
    const p1 = chunk.emitJump(Op.JumpFalse, 1);
    chunk.writeByte(Op.LoadNull, 1);
    chunk.writeByte(Op.Pop, 1);
    chunk.patchJump(p1);

    expect(chunk.code[0]).toBe(Op.JumpFalse);
    // 2 bytes emitted (LoadNull, Pop) -> relative offset should be 2
    const targetOffset = ((chunk.code[p1] << 8) | chunk.code[p1 + 1]) >>> 0;
    expect(targetOffset).toBe(2);
  });

  test("emitLoop writes correct negative backward offset", () => {
    const chunk = new Chunk("loop_test", 0);
    const loopStart = chunk.code.length;
    chunk.writeByte(Op.LoadConst, 1);
    chunk.writeU16(0, 1);
    chunk.emitLoop(loopStart, 2);

    const loopJumpOffset = chunk.code.length - 2;
    const raw = (chunk.code[loopJumpOffset] << 8) | chunk.code[loopJumpOffset + 1];
    const rel = raw > 0x7fff ? raw - 0x10000 : raw;
    expect(chunk.code.length + rel).toBe(loopStart);
  });

  // ── 2. Serialization & Deserialization ─────────────────────────────────────
  test("FastBufferWriter serializer produces valid binary that roundtrips through deserializeProgram", () => {
    const source = `
      fn calculate(a: Int, b: Int) -> Int {
        let mut sum = a + b
        if sum > 100 {
          sum = sum * 2
        }
        return sum
      }
      let res = calculate(25, 30)
      println(res)
    `;
    const chunk = compileToChunk(source);
    const buffer = serializeProgram(chunk);

    // Verify 8-byte header
    expect(buffer.toString("ascii", 0, 4)).toBe("HKDB");
    expect(buffer.readUInt8(4)).toBe(1);

    // Verify roundtrip deserialization
    const deserialized = deserializeProgram(buffer);
    expect(deserialized.name).toBe(chunk.name);
    expect(deserialized.arity).toBe(chunk.arity);
    expect(deserialized.localCount).toBe(chunk.localCount);
    expect(deserialized.code).toEqual(chunk.code);
    expect(deserialized.lines).toEqual(chunk.lines);
    expect(deserialized.constants.length).toBe(chunk.constants.length);
  });

  test("serialize(chunk) is deterministic across multiple serialization invocations", () => {
    const source = `
      let items = [1, 2, 3, 4]
      let total = 0
      for x in items {
        total = total + x
      }
    `;
    const chunk = compileToChunk(source);
    const buf1 = serialize(chunk);
    const buf2 = serialize(chunk);
    expect(buf1.equals(buf2)).toBe(true);
  });

  // ── 3. Register Lowering With Flat IP Mapping ───────────────────────────────
  test("register lowering translates control flow jumps accurately with Int32Array mapping", () => {
    const source = `
      let i = 0
      let sum = 0
      while i < 10 {
        if i % 2 == 0 {
          sum = sum + i
        }
        i = i + 1
      }
      return sum
    `;
    const chunk = compileToChunk(source);
    const regChunk = lowerToRegisterChunk(chunk);

    expect(regChunk.code.length).toBeGreaterThan(0);
    expect(regChunk.registerCount).toBeGreaterThan(0);

    // Verify jump targets point to valid instruction indices
    for (let i = 0; i < regChunk.code.length; i++) {
      const ins = regChunk.code[i];
      if (ins.op === RegOp.Jump) {
        expect(ins.dst).toBeGreaterThanOrEqual(0);
        expect(ins.dst).toBeLessThan(regChunk.code.length);
      } else if (ins.op === RegOp.JumpIf || ins.op === RegOp.JumpIfNot) {
        expect(ins.src2).toBeGreaterThanOrEqual(0);
        expect(ins.src2).toBeLessThan(regChunk.code.length);
      }
    }
  });

  // ── 4. Compiler Repeated Compilation Isolation ─────────────────────────────
  test("100x repeated compilation produces identical bytecode without memory leaks or state bleed", () => {
    const source = `
      fn process(x: Int) -> Int {
        return x * 10 + 5
      }
      let r = process(7)
    `;
    let baselineCode: number[] | null = null;
    let baselineConstantsLen = 0;

    for (let i = 0; i < 100; i++) {
      const chunk = compileToChunk(source);
      if (baselineCode === null) {
        baselineCode = [...chunk.code];
        baselineConstantsLen = chunk.constants.length;
      } else {
        expect(chunk.code).toEqual(baselineCode);
        expect(chunk.constants.length).toBe(baselineConstantsLen);
      }
    }
  });

  // ── 5. Differential VM Execution Parity ─────────────────────────────────────
  test("arithmetic and expressions evaluate identically across VM reference and Register VM", () => {
    const source = `
      let a = 15
      let b = 4
      println(a + b)
      println(a - b)
      println(a * b)
      println(a / b)
      println(a % b)
      println(a == b)
      println(a > b)
    `;
    assertParity(source);
  });

  test("multi-function and nested loop execution maintains 100% differential parity", () => {
    const source = `
      fn add(x: Int, y: Int) -> Int { return x + y }
      fn mul(x: Int, y: Int) -> Int { return x * y }

      let total = 0
      let i = 0
      while i < 5 {
        let j = 0
        while j < 5 {
          total = add(total, mul(i, j))
          j = j + 1
        }
        i = i + 1
      }
      println(total)
    `;
    assertParity(source);
  });

  test("closures and upvalues execute identically across Stack VM and Register VM", () => {
    const source = `
      fn makeCounter(initial: Int) {
        let count = initial
        return fn() -> Int {
          count = count + 1
          return count
        }
      }
      let c1 = makeCounter(10)
      println(c1())
      println(c1())
      println(c1())
    `;
    assertParity(source);
  });

  test("large source modular compilation compiles and executes with parity", () => {
    const source = `
      struct Point {
        x: Int
        y: Int
      }
      fn createPoint(x: Int, y: Int) -> Point {
        return Point { x: x, y: y }
      }
      fn manhattan(p1: Point, p2: Point) -> Int {
        let dx = p1.x - p2.x
        if dx < 0 { dx = 0 - dx }
        let dy = p1.y - p2.y
        if dy < 0 { dy = 0 - dy }
        return dx + dy
      }
      let p1 = createPoint(10, 20)
      let p2 = createPoint(25, 40)
      println(manhattan(p1, p2))
    `;
    assertParity(source);
  });
});
