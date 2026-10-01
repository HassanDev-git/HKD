/**
 * HKD Phase 9I — Runtime Representation & Execution Specialization Test Suite
 *
 * Verifies:
 *   1. Direct native call dispatch (call1, call2) without temporary argument array slices
 *   2. Inlined array indexing (GetIndex, SetIndex, ArrayLen) fast-paths and bounds errors
 *   3. Inlined object/struct field access (GetField, SetField) and method dispatch
 *   4. Integer and floating-point numeric arithmetic consistency
 *   5. Full differential parity between Reference Stack VM and Register VM
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { ErrorCode } from "../../src/errors/index.js";

function assertDifferentialParity(source: string, edition: "2026" | "2027" = "2026") {
  const stackOut: string[] = [];
  const regOut: string[] = [];

  const oldVm = process.env.HKD_VM;
  try {
    delete process.env.HKD_VM;
    const resStack = runSource(source, {
      edition,
      noExit: true,
      output: (s: string) => stackOut.push(s),
      printDiagnostics: false,
    });
    expect(resStack.ok).toBe(true);

    process.env.HKD_VM = "register";
    const resReg = runSource(source, {
      edition,
      noExit: true,
      output: (s: string) => regOut.push(s),
      printDiagnostics: false,
    });
    expect(resReg.ok).toBe(true);

    expect(regOut).toEqual(stackOut);
    expect(resReg.value).toEqual(resStack.value);
  } finally {
    process.env.HKD_VM = oldVm;
  }
}

describe("Phase 9I: Runtime Representation & Specialization", () => {
  // ── 1. Array Operations & Native Fast-Paths ───────────────────────────────
  test("Array push and len specialization across loops", () => {
    const src = `
      import array
      let arr = []
      let i = 0
      while i < 100 {
        array.push(arr, i * 2)
        i = i + 1
      }
      print(to_string(array.len(arr)))
      print(to_string(arr[0]))
      print(to_string(arr[99]))
    `;
    assertDifferentialParity(src);
  });

  test("Array indexing, negative indices and mutation", () => {
    const src = `
      let items = [10, 20, 30, 40, 50]
      items[0] = 999
      items[4] = 888
      print(to_string(items[0]))
      print(to_string(items[2]))
      print(to_string(items[-1]))
      print(to_string(items[-2]))
    `;
    assertDifferentialParity(src);
  });

  test("Array out-of-bounds error handling in both VMs", () => {
    const src = `
      let items = [1, 2, 3]
      print(to_string(items[10]))
    `;
    const resStack = runSource(src, { noExit: true, printDiagnostics: false });
    const resReg = runSource(src, { noExit: true, printDiagnostics: false, vm: "register" });
    expect(resStack.ok).toBe(false);
    expect(resReg.ok).toBe(false);
    expect(resReg.error).toContain("out of bounds");
  });

  // ── 2. Struct & Object Field Specialization ───────────────────────────────
  test("Struct property mutation and reading in hot loops", () => {
    const src = `
      struct Vector {
        x: Int
        y: Int
      }
      let v = Vector { x: 5, y: 10 }
      let i = 0
      while i < 500 {
        v.x = v.x + 1
        v.y = v.y + 2
        i = i + 1
      }
      print(to_string(v.x) + "," + to_string(v.y))
    `;
    assertDifferentialParity(src);
  });

  test("Dynamic object property assignment and retrieval", () => {
    const src = `
      let obj = { alpha: 100, beta: "test" }
      obj.alpha = obj.alpha + 50
      obj.gamma = true
      print(to_string(obj.alpha))
      print(to_string(obj.beta))
      print(to_string(obj.gamma))
    `;
    assertDifferentialParity(src);
  });

  // ── 3. Core Builtin Call Fast-Paths ───────────────────────────────────────
  test("Builtin functions (to_string, len, type_of) fast dispatch", () => {
    const src = `
      let a = 42
      let b = 3.14
      let c = "hkd"
      let d = [1, 2]
      print(to_string(a))
      print(to_string(b))
      print(type_of(a))
      print(type_of(b))
      print(type_of(c))
      print(type_of(d))
      print(to_string(len(c)))
      print(to_string(len(d)))
    `;
    assertDifferentialParity(src);
  });

  // ── 4. Mixed Integer & Float Arithmetic ───────────────────────────────────
  test("Mixed numeric expressions and operator precedence", () => {
    const src = `
      let x = 10
      let y = 2.5
      let z = (x * 3) + (y * 4) - (x / 2)
      print(to_string(z))
    `;
    assertDifferentialParity(src);
  });

  // ── 5. String Manipulation Specialization ─────────────────────────────────
  test("String method and property access", () => {
    const src = `
      import string
      let s = "HKD Language"
      print(to_string(string.len(s)))
      print(to_string(s.length))
      print(s.upper())
      print(s.lower())
    `;
    assertDifferentialParity(src);
  });
});
