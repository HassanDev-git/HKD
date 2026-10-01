/**
 * HKD Phase 9H — VM Hot-Path Recovery & Benchmark Isolation Test Suite
 *
 * Verifies:
 *   1. Call frame pooling & recursion depth stability in Register VM
 *   2. Closure reuse for non-capturing functions without state bleeding
 *   3. Numeric arithmetic and modulo fast-paths (integers, floats, edge cases)
 *   4. Fast boolean conditional branching (truthy/falsy semantics)
 *   5. GlobalCell resolution fast-paths with undefined variable checks
 *   6. String concatenation and buffer allocation parity
 *   7. Differential Parity between Reference Stack VM and Register VM
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { VM } from "../../src/vm/vm.js";
import { RegisterVM } from "../../src/vm/vm_register.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";

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

describe("Phase 9H: VM Hot-Path Recovery & Parity", () => {
  // ── 1. Call Frame Pooling & Recursion ─────────────────────────────────────
  test("Deep recursion and call frame pooling in Register VM", () => {
    const src = `
      fn fib(n: Int) -> Int {
        if n <= 1 {
          return n
        }
        return fib(n - 1) + fib(n - 2)
      }
      print(to_string(fib(15)))
    `;
    assertDifferentialParity(src);
  });

  test("Mutual recursion stability with frame reuse", () => {
    const src = `
      fn is_even(n: Int) -> Bool {
        if n == 0 {
          return true
        }
        return is_odd(n - 1)
      }
      fn is_odd(n: Int) -> Bool {
        if n == 0 {
          return false
        }
        return is_even(n - 1)
      }
      print(to_string(is_even(50)))
      print(to_string(is_odd(50)))
      print(to_string(is_even(51)))
    `;
    assertDifferentialParity(src);
  });

  test("Non-capturing function closure reuse maintains isolated registers", () => {
    const src = `
      fn compute(a: Int, b: Int) -> Int {
        let x = a * 2
        let y = b * 3
        return x + y
      }
      let acc = 0
      let i = 0
      while i < 100 {
        acc = acc + compute(i, i + 1)
        i = i + 1
      }
      print(to_string(acc))
    `;
    assertDifferentialParity(src);
  });

  // ── 2. Arithmetic Fast-Paths ──────────────────────────────────────────────
  test("Integer arithmetic and modulo fast-paths", () => {
    const src = `
      let a = 12345
      let b = 67
      let sum = a + b
      let diff = a - b
      let prod = a * b
      let div = a / b
      let rem = a % b
      print(to_string(sum))
      print(to_string(diff))
      print(to_string(prod))
      print(to_string(div))
      print(to_string(rem))
    `;
    assertDifferentialParity(src);
  });

  test("Floating-point numeric arithmetic precision and parity", () => {
    const src = `
      let x = 1.5
      let i = 0
      while i < 100 {
        x = (x * 1.00001 + 0.5) / 1.00001 - 0.49999
        i = i + 1
      }
      print(to_string(x > 1.4 && x < 1.6))
    `;
    assertDifferentialParity(src);
  });

  test("Division by zero error trapping parity", () => {
    const src = `
      let x = 10 / 0
    `;
    const resStack = runSource(src, { noExit: true, printDiagnostics: false });
    const resReg = runSource(src, { noExit: true, printDiagnostics: false, vm: "register" });
    expect(resStack.ok).toBe(false);
    expect(resReg.ok).toBe(false);
    expect(resReg.error).toContain("Division by zero");
  });

  test("Modulo by zero error trapping parity", () => {
    const src = `
      let x = 10 % 0
    `;
    const resStack = runSource(src, { noExit: true, printDiagnostics: false });
    const resReg = runSource(src, { noExit: true, printDiagnostics: false, vm: "register" });
    expect(resStack.ok).toBe(false);
    expect(resReg.ok).toBe(false);
    expect(resReg.error).toContain("Modulo by zero");
  });

  // ── 3. Fast Boolean Branching ─────────────────────────────────────────────
  test("Boolean conditional branching and truthy/falsy evaluation", () => {
    const src = `
      fn check_truth(val: Any) -> String {
        if val {
          return "truthy"
        } else {
          return "falsy"
        }
      }
      print(check_truth(true))
      print(check_truth(false))
      print(check_truth(0))
      print(check_truth(1))
      print(check_truth(""))
      print(check_truth("hello"))
    `;
    assertDifferentialParity(src);
  });

  // ── 4. GlobalCell Fast-Paths & Error Parity ────────────────────────────────
  test("GlobalCell fast lookup and mutation across loop", () => {
    const src = `
      let counter = 0
      let i = 0
      while i < 500 {
        counter = counter + 1
        i = i + 1
      }
      print(to_string(counter))
    `;
    assertDifferentialParity(src);
  });

  test("Undefined variable access throws E301 in both VMs", () => {
    const src = `
      print(to_string(nonExistentVar))
    `;
    const resStack = runSource(src, { noExit: true, printDiagnostics: false, analyse: false });
    const resReg = runSource(src, { noExit: true, printDiagnostics: false, analyse: false, vm: "register" });
    expect(resStack.ok).toBe(false);
    expect(resReg.ok).toBe(false);
    expect(resReg.error).toContain("Undefined variable");
  });

  // ── 5. String & Allocation Workloads ──────────────────────────────────────
  test("String concatenation and length parity", () => {
    const src = `
      import string
      let s = "prefix"
      let i = 0
      while i < 50 {
        s = s + "-" + to_string(i)
        i = i + 1
      }
      print(to_string(string.len(s)))
    `;
    assertDifferentialParity(src);
  });

  test("Batch array allocation and collection handling", () => {
    const src = `
      import array
      fn make_grid(rows: Int, cols: Int) -> Int {
        let grid = []
        let r = 0
        while r < rows {
          let row = []
          let c = 0
          while c < cols {
            array.push(row, r * cols + c)
            c = c + 1
          }
          array.push(grid, row)
          r = r + 1
        }
        return array.len(grid)
      }
      print(to_string(make_grid(10, 10)))
    `;
    assertDifferentialParity(src);
  });

  test("Object instantiation and property mutation parity", () => {
    const src = `
      let obj = { x: 10, y: 20 }
      obj.x = obj.x + 5
      obj.y = obj.y * 2
      print(to_string(obj.x))
      print(to_string(obj.y))
    `;
    assertDifferentialParity(src);
  });
});
