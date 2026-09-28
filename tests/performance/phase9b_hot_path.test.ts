/**
 * HKD Phase 9B — VM Hot-Path Optimization Verification Suite
 *
 * Verifies correctness, safety, edge cases, and fallbacks of the
 * VM hot-path optimizations implemented in Phase 9B:
 * - Integer arithmetic fast-path
 * - Numeric floating-point arithmetic
 * - String concatenation fallback
 * - Type-error fallbacks and zero-division traps
 * - Fast numeric & boolean comparisons
 * - Structural equality fallback
 * - Local variable access and stack balance
 * - Global variable single-lookup & undefined trap
 * - Deep recursion & frame stack discipline
 */

import { runSource } from "../../src/runtime/index.js";
import { ErrorCode } from "../../src/errors/index.js";

describe("HKD Phase 9B: VM Hot-Path Optimizations", () => {
  // ── 1. Integer Arithmetic Fast-Path ───────────────────────────────────────
  describe("Integer Arithmetic", () => {
    test("computes basic integer arithmetic without precision loss", () => {
      const src = `
        let a = 100
        let b = 35
        let add = a + b
        let sub = a - b
        let mul = a * b
        let div = a / b
        let mod = a % b
        let neg = -a
        print(to_string(add) + "," + to_string(sub) + "," + to_string(mul) + "," + to_string(div) + "," + to_string(mod) + "," + to_string(neg))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("135,65,3500,2.857142857142857,30,-100");
    });

    test("traps division and modulo by zero with ErrorCode.E401", () => {
      const divZero = runSource("let x = 10 / 0", { printDiagnostics: false });
      expect(divZero.ok).toBe(false);
      expect(divZero.error).toContain("Division by zero");

      const modZero = runSource("let x = 10 % 0", { printDiagnostics: false });
      expect(modZero.ok).toBe(false);
      expect(modZero.error).toContain("Modulo by zero");
    });

    test("handles large integer values and signed boundaries", () => {
      const src = `
        let max = 2147483647
        let big = max + 100
        let neg = -big
        print(to_string(big) + "," + to_string(neg))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("2147483747,-2147483747");
    });
  });

  // ── 2. Numeric Floating-Point Math ───────────────────────────────────────
  describe("Floating-Point Arithmetic", () => {
    test("computes floating point addition, subtraction, multiplication, and powers", () => {
      const src = `
        let f1 = 3.14159
        let f2 = 2.71828
        let sum = f1 + f2
        let diff = f1 - f2
        let prod = f1 * f2
        let pow = 2.0 ** 3.0
        print(to_string(pow) + "," + to_string(sum > 5.0) + "," + to_string(diff > 0.0) + "," + to_string(prod > 8.0))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("8,true,true,true");
    });
  });

  // ── 3. Type Coercion & Fallback ──────────────────────────────────────────
  describe("Arithmetic Type Fallbacks", () => {
    test("falls back to string concatenation for string operands", () => {
      const src = `
        let s1 = "hkd-"
        let s2 = "lang"
        let num = 42
        print(s1 + s2)
        print(s1 + to_string(num))
        print(to_string(num) + s2)
      `;
      const lines: string[] = [];
      const res = runSource(src, { output: (s) => lines.push(s) });
      expect(res.ok).toBe(true);
      expect(lines).toEqual(["hkd-lang", "hkd-42", "42lang"]);
    });

    test("rejects invalid arithmetic operand types", () => {
      const subStr = runSource('let x = "hello" - 5', { printDiagnostics: false });
      expect(subStr.ok).toBe(false);
      expect(subStr.error).toContain("Operator '-' requires numbers");

      const mulBool = runSource("let x = true * 5", { printDiagnostics: false });
      expect(mulBool.ok).toBe(false);
      expect(mulBool.error).toContain("Operator '*' requires numbers");
    });
  });

  // ── 4. Comparison Fast-Path & Fallbacks ───────────────────────────────────
  describe("Fast Comparisons", () => {
    test("evaluates fast numeric comparisons correctly", () => {
      const src = `
        let a = 10
        let b = 20
        print(to_string(a < b))
        print(to_string(a <= 10))
        print(to_string(b > a))
        print(to_string(b >= 20))
        print(to_string(a == 10))
        print(to_string(a != b))
      `;
      const lines: string[] = [];
      const res = runSource(src, { output: (s) => lines.push(s) });
      expect(res.ok).toBe(true);
      expect(lines).toEqual(["true", "true", "true", "true", "true", "true"]);
    });

    test("evaluates boolean fast comparisons", () => {
      const src = `
        let t = true
        let f = false
        print(to_string(t == true))
        print(to_string(t != f))
      `;
      const lines: string[] = [];
      const res = runSource(src, { output: (s) => lines.push(s) });
      expect(res.ok).toBe(true);
      expect(lines).toEqual(["true", "true"]);
    });

    test("falls back to structural equality for arrays", () => {
      const src = `
        let a1 = [1, 2, 3]
        let a2 = [1, 2, 3]
        let a3 = [1, 2, 4]
        print(to_string(a1 == a2))
        print(to_string(a1 == a3))
      `;
      const lines: string[] = [];
      const res = runSource(src, { output: (s) => lines.push(s) });
      expect(res.ok).toBe(true);
      expect(lines).toEqual(["true", "false"]);
    });
  });

  // ── 5. Local and Global Variable Access ───────────────────────────────────
  describe("Locals, Globals, and Loops", () => {
    test("maintains correct stack indexing in nested function scopes", () => {
      const src = `
        fn outer(x: Int) -> Int {
          let y = x * 2
          fn inner(z: Int) -> Int {
            return x + y + z
          }
          return inner(5)
        }
        print(to_string(outer(10)))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("35");
    });

    test("safely traps undefined global access", () => {
      const src = "print(to_string(unknown_var))";
      const res = runSource(src, { analyse: false, printDiagnostics: false });
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Undefined variable `unknown_var`");
    });

    test("executes tight loop with fast counter increments without stack leakage", () => {
      const src = `
        let i = 0
        while i < 10000 {
          i = i + 1
        }
        print(to_string(i))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("10000");
    });
  });

  // ── 6. Recursion & Stack Discipline ──────────────────────────────────────
  describe("Recursion & Frame Stack", () => {
    test("handles recursive calls and restores stack pointers cleanly", () => {
      const src = `
        fn fib(n: Int) -> Int {
          if n <= 1 { return n }
          return fib(n - 1) + fib(n - 2)
        }
        print(to_string(fib(10)))
      `;
      let output = "";
      const res = runSource(src, { output: (s) => (output += s) });
      expect(res.ok).toBe(true);
      expect(output).toBe("55");
    });
  });
});
