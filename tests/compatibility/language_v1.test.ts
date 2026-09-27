/**
 * HKD 1.0.x Language Backward Compatibility & API Stability Suite
 *
 * Verifies the contractual stability of HKD Edition 2026 across 1.0.x releases:
 * 1. Language syntax, variable bindings, and control structures
 * 2. Functions, first-class closures, and recursion
 * 3. Array and object collection semantics
 * 4. Bytecode header and opcode ISA stability
 * 5. Standard library global functions and error recovery
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { Chunk } from "../../src/bytecode/chunk.js";
import { Op } from "../../src/bytecode/opcodes.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { HKD_VERSION } from "../../src/utils/index.js";

describe("HKD 1.0 Language Compatibility Contract (tests/compatibility/language_v1.test.ts)", () => {
  test("HKD_VERSION adheres to SemVer 1.x", () => {
    expect(HKD_VERSION).toBe("1.1.0");
  });

  test("C-COMPAT-01: Immutable & mutable variable assignments", () => {
    const output: string[] = [];
    const src = `
      let x = 10;
      let y = 20;
      x = x + y;
      print(x);
    `;
    const res = runSource(src, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["30"]);
  });

  test("C-COMPAT-02: Higher-order functions and lexical closures", () => {
    const output: string[] = [];
    const src = `
      fn make_multiplier(factor) {
          return fn(val) {
              return val * factor;
          };
      }
      let double = make_multiplier(2);
      let triple = make_multiplier(3);
      print(double(15));
      print(triple(15));
    `;
    const res = runSource(src, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["30", "45"]);
  });

  test("C-COMPAT-03: While loop iteration & accumulator semantics", () => {
    const output: string[] = [];
    const src = `
      let count = 0;
      let sum = 0;
      while count < 5 {
          count = count + 1;
          sum = sum + count;
      }
      print(sum);
    `;
    const res = runSource(src, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["15"]);
  });

  test("C-COMPAT-04: Arrays, indexing, and iteration", () => {
    const output: string[] = [];
    const src = `
      let list = [100, 200, 300];
      print(list[1]);
      let total = 0;
      for item in list {
          total = total + item;
      }
      print(total);
    `;
    const res = runSource(src, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["200", "600"]);
  });

  test("C-COMPAT-05: Logical short-circuiting and boolean precedence", () => {
    const output: string[] = [];
    const src = `
      let a = true;
      let b = false;
      print(a && b);
      print(a || b);
      print(!b && (10 > 5));
    `;
    const res = runSource(src, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["false", "true", "true"]);
  });

  test("C-COMPAT-06: Bytecode ISA opcode stability", () => {
    // Opcode numbers are immutable across Edition 2026
    expect(Op.LoadConst).toBe(0x01);
    expect(Op.LoadNull).toBe(0x02);
    expect(Op.LoadTrue).toBe(0x03);
    expect(Op.LoadFalse).toBe(0x04);
    expect(Op.Add).toBe(0x20);
    expect(Op.Sub).toBe(0x21);
    expect(Op.Mul).toBe(0x22);
    expect(Op.Call).toBe(0x60);
    expect(Op.Return).toBe(0x61);
  });

  test("C-COMPAT-07: Bytecode serialized header format compatibility", () => {
    const chunk = new Chunk("<compat-main>", 0);
    chunk.writeByte(Op.LoadTrue, 1);
    chunk.writeByte(Op.Return, 1);
    const buf = serializeProgram(chunk);

    expect(buf.toString("ascii", 0, 4)).toBe("HKDB");
    expect(buf.readUInt8(4)).toBe(1); // Bytecode format version
  });
});
