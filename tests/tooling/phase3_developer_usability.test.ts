/**
 * Phase 3 Developer Usability & Dogfooding Regression Tests
 *
 * Validates fixes for:
 * 1. For loop local variable & compound assignment stack safety
 * 2. Named import specifiers
 * 3. Object & struct field initialization shorthand
 * 4. Object literal field semantic analysis without false unused warnings
 */

import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<usability-test>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("Phase 3 Developer Usability Improvements", () => {
  describe("For-In Loop Stack Stability (BUG-01)", () => {
    test("Loop body declaring local variables runs all iterations without clobbering iterator", () => {
      const src = `
        let results = []
        for x in [1, 2, 3, 4] {
          let doubled = x * 2
          let formatted = "num:" + to_string(doubled)
          print(formatted)
        }
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["num:2", "num:4", "num:6", "num:8"]);
    });

    test("Loop body using compound assignment operates without leaking stack slots", () => {
      const src = `
        let sum = 0
        let numbers = [10, 20, 30, 40]
        for n in numbers {
          sum += n
        }
        print(sum)
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["100"]);
    });

    test("Nested for-in loops with inner local declarations execute correctly", () => {
      const src = `
        let pairs = []
        for a in [1, 2] {
          for b in [10, 20] {
            let prod = a * b
            print(to_string(prod))
          }
        }
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["10", "20", "20", "40"]);
    });
  });

  describe("Object & Struct Field Initialization Shorthand (ERG-05)", () => {
    test("Object literal field shorthand { key } binds from in-scope identifier", () => {
      const src = `
        let name = "Alice"
        let role = "Admin"
        let user = { name, role }
        print(user.name)
        print(user.role)
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["Alice", "Admin"]);
    });

    test("Struct initialization shorthand Struct { field } binds from in-scope identifier", () => {
      const src = `
        struct Vector2 {
          x: Float
          y: Float
        }
        let x = 3.5
        let y = 7.0
        let v = Vector2 { x, y }
        print(to_string(v.x) + "," + to_string(v.y))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["3.5,7"]);
    });

    test("Mixed shorthand and explicit colon key-values in same literal", () => {
      const src = `
        let a = 1
        let obj = { a, b: 2, c: 3 }
        print(to_string(obj.a) + to_string(obj.b) + to_string(obj.c))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["123"]);
    });
  });

  describe("Object Field Semantic Analysis (BUG-03)", () => {
    test("Variables used inside object literals are correctly marked as used", () => {
      const src = `
        let secret = 42
        let payload = { "value": secret }
        print(payload.value)
      `;
      const output: string[] = [];
      const res = runSource(src, {
        fileName: "<semantic-obj-test>",
        output: (s) => output.push(s),
        printDiagnostics: false,
      });
      expect(res.ok).toBe(true);
      // No E301 unused variable warning for `secret`
      const hasUnusedWarning = (res.diagnostics ?? []).some((d) => d.includes("E301"));
      expect(hasUnusedWarning).toBe(false);
      expect(output).toEqual(["42"]);
    });
  });

  describe("Named Import Specifiers (BUG-02)", () => {
    test("Named imports from stdlib modules bind symbols cleanly", () => {
      const src = `
        import { sqrt, abs } from "math"
        print(sqrt(16))
        print(abs(-9))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["4", "9"]);
    });

    test("Named import with alias import { x as y } from stdlib", () => {
      const src = `
        import { sqrt as my_sqrt } from "math"
        print(my_sqrt(25))
      `;
      const { output, ok } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["5"]);
    });
  });
});
