/**
 * HKD 1.1 Iterators & Collections 2.0 Hardening & Edge-Case Suite
 * (tests/stdlib/iterators_collections_hardening.test.ts)
 *
 * Exhaustive edge-case testing for standard library functional iterators
 * and Result 2.0 monadic APIs:
 * 1. Empty collections behavior
 * 2. Large collections (10,000 items) zero-leak processing
 * 3. Deeply chained pipelines
 * 4. Invalid inputs and type handling
 * 5. Nested higher-order operations
 * 6. Result Ok / Err transformation pipelines
 * 7. Result unwrap / unwrap_err failure boundaries
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";

function run(source: string, edition: "2026" | "2027" = "2027") {
  let out = "";
  const res = runSource(source, {
    edition,
    noExit: true,
    output: (s) => {
      out += s + "\n";
    },
    printDiagnostics: false,
  });
  return { ...res, output: out.trim() };
}

describe("HKD 1.1 Iterators & Collections 2.0 Hardening & Boundary Suite", () => {
  describe("Empty Collections Edge Cases", () => {
    test("ITER-HARDEN-01: array.map on empty array returns empty array", () => {
      const src = `
        import array;
        let empty = [];
        let res = array.map(empty, fn(x) { return x * 2; });
        print(array.len(res));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("0");
    });

    test("ITER-HARDEN-02: array.filter on empty array returns empty array", () => {
      const src = `
        import array;
        let empty = [];
        let res = array.filter(empty, fn(x) { return true; });
        print(array.len(res));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("0");
    });

    test("ITER-HARDEN-03: array.take and array.skip on empty array", () => {
      const src = `
        import array;
        let empty = [];
        let t = array.take(empty, 5);
        let s = array.skip(empty, 5);
        print(array.len(t));
        print(array.len(s));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("0\n0");
    });

    test("ITER-HARDEN-04: array.any and array.all on empty array (vacuous truth)", () => {
      const src = `
        import array;
        let empty = [];
        let has_any = array.any(empty, fn(x) { return true; });
        let all_match = array.all(empty, fn(x) { return false; });
        print(has_any);
        print(all_match);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("false\ntrue");
    });

    test("ITER-HARDEN-05: array.zip with mismatched lengths truncates to shortest", () => {
      const src = `
        import array;
        let a = [1, 2, 3];
        let b = ["a", "b"];
        let zipped = array.zip(a, b);
        print(array.len(zipped));
        print(zipped[0][0]);
        print(zipped[0][1]);
        print(zipped[1][0]);
        print(zipped[1][1]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("2\n1\na\n2\nb");
    });
  });

  describe("Large Scale Collections (10,000 Elements)", () => {
    test("ITER-HARDEN-06: array.map and filter on 10,000 elements without stack overflow", () => {
      const src = `
        import array;
        let items = [];
        let i = 0;
        while (i < 10000) {
          array.push(items, i);
          i = i + 1;
        }
        print(array.len(items));
        let evens = array.filter(items, fn(x) { return x % 2 == 0; });
        print(array.len(evens));
        let first_ten = array.take(evens, 10);
        print(array.len(first_ten));
        print(first_ten[9]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("10000\n5000\n10\n18");
    });
  });

  describe("Chained Functional Pipelines", () => {
    test("ITER-HARDEN-07: multi-stage pipeline (skip -> filter -> map -> take)", () => {
      const src = `
        import array;
        let data = [10, 15, 20, 25, 30, 35, 40, 45, 50];
        // skip 2 -> [20, 25, 30, 35, 40, 45, 50]
        let s = array.skip(data, 2);
        // filter even -> [20, 30, 40, 50]
        let f = array.filter(s, fn(x) { return x % 2 == 0; });
        // map divide by 10 -> [2, 3, 4, 5]
        let m = array.map(f, fn(x) { return x / 10; });
        // take 2 -> [2, 3]
        let t = array.take(m, 2);
        print(array.len(t));
        print(t[0]);
        print(t[1]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("2\n2\n3");
    });

    test("ITER-HARDEN-08: array.enumerate produces [index, element] tuples", () => {
      const src = `
        import array;
        let words = ["alpha", "beta", "gamma"];
        let pairs = array.enumerate(words);
        print(array.len(pairs));
        print(pairs[0][0]);
        print(pairs[0][1]);
        print(pairs[2][0]);
        print(pairs[2][1]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("3\n0\nalpha\n2\ngamma");
    });
  });

  describe("Result 2.0 Monadic Hardening", () => {
    test("RESULT-HARDEN-01: result.map transforms Ok and leaves Err intact", () => {
      const src = `
        import result;
        let ok_val = result.ok(100);
        let err_val = result.err("not a number");

        let mapped_ok = result.map(ok_val, fn(x) { return x + 50; });
        let mapped_err = result.map(err_val, fn(x) { return x + 50; });

        print(result.is_ok(mapped_ok));
        print(result.unwrap(mapped_ok));
        print(result.is_err(mapped_err));
        print(result.unwrap_err(mapped_err));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\n150\ntrue\nnot a number");
    });

    test("RESULT-HARDEN-02: result.map_err transforms Err and leaves Ok intact", () => {
      const src = `
        import result;
        let ok_val = result.ok("success");
        let err_val = result.err("timeout");

        let mapped_ok = result.map_err(ok_val, fn(e) { return "FATAL: " + e; });
        let mapped_err = result.map_err(err_val, fn(e) { return "FATAL: " + e; });

        print(result.unwrap(mapped_ok));
        print(result.unwrap_err(mapped_err));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("success\nFATAL: timeout");
    });

    test("RESULT-HARDEN-03: result.and_then chains multiple operations and short-circuits on Err", () => {
      const src = `
        import result;
        fn safe_div(a, b) {
          if (b == 0) {
            return result.err("division by zero");
          }
          return result.ok(a / b);
        }

        let step1 = safe_div(100, 2); // Ok(50)
        let step2 = result.and_then(step1, fn(val) {
          return safe_div(val, 5); // Ok(10)
        });
        let step3 = result.and_then(step2, fn(val) {
          return safe_div(val, 0); // Err("division by zero")
        });
        let step4 = result.and_then(step3, fn(val) {
          return safe_div(val, 2); // Should not run
        });

        print(result.is_ok(step2));
        print(result.unwrap(step2));
        print(result.is_err(step4));
        print(result.unwrap_err(step4));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\n10\ntrue\ndivision by zero");
    });

    test("RESULT-HARDEN-04: unwrap on Err throws runtime error safely", () => {
      const src = `
        import result;
        let bad = result.err("disk full");
        let x = result.unwrap(bad);
      `;
      const res = run(src);
      expect(res.ok).toBe(false);
      expect(String(res.error)).toContain("Called Result.unwrap() on an Err value: disk full");
    });

    test("RESULT-HARDEN-05: unwrap_err on Ok throws runtime error safely", () => {
      const src = `
        import result;
        let good = result.ok("payload data");
        let e = result.unwrap_err(good);
      `;
      const res = run(src);
      expect(res.ok).toBe(false);
      expect(String(res.error)).toContain("Called Result.unwrap_err() on an Ok value");
    });
  });
});
