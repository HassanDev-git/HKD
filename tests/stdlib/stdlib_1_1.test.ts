/**
 * HKD 1.1 Standard Library Test Suite
 * (tests/stdlib/stdlib_1_1.test.ts)
 *
 * Tests standard library 1.1 additions:
 * - array functional iterators (find, every, some, reduce)
 * - result module (ok, err, is_ok, is_err, unwrap, unwrap_or)
 */

import { runSource } from "../../src/runtime/index.js";

function run(source: string, edition: "2026" | "2027" = "2027") {
  let out = "";
  const res = runSource(source, {
    edition,
    noExit: true,
    output: s => { out += s + "\n"; },
  });
  return { ...res, output: out.trim() };
}

describe("HKD 1.1 Standard Library Enhancements", () => {
  describe("Array Functional Iterators", () => {
    test("STD-01: array.find returns first matching element or null", () => {
      const src = `
        import array;

        fn is_even(x: Int) -> Bool {
          return x % 2 == 0;
        }

        let nums = [1, 3, 4, 7, 8];
        let found = array.find(nums, is_even);
        print(found);

        let none = array.find([1, 3, 5], is_even);
        print(none == null);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("4\ntrue");
    });

    test("STD-02: array.every checks if all elements satisfy predicate", () => {
      const src = `
        import array;

        fn is_pos(x: Int) -> Bool {
          return x > 0;
        }

        print(array.every([1, 2, 3], is_pos));
        print(array.every([1, -2, 3], is_pos));
        print(array.every([], is_pos));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\nfalse\ntrue");
    });

    test("STD-03: array.some checks if at least one element satisfies predicate", () => {
      const src = `
        import array;

        fn is_ten(x: Int) -> Bool {
          return x == 10;
        }

        print(array.some([1, 5, 10, 20], is_ten));
        print(array.some([1, 2, 3], is_ten));
        print(array.some([], is_ten));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\nfalse\nfalse");
    });

    test("STD-04: array.reduce folds elements into single accumulator", () => {
      const src = `
        import array;

        fn sum(acc: Int, x: Int) -> Int {
          return acc + x;
        }

        let total = array.reduce([1, 2, 3, 4, 5], sum, 0);
        print(total);

        fn concat(acc: String, word: String) -> String {
          return acc + " " + word;
        }
        let sentence = array.reduce(["is", "fast"], concat, "HKD");
        print(sentence);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("15\nHKD is fast");
    });
  });

  describe("Result Module", () => {
    test("STD-05: result.ok and result.err constructors and predicates", () => {
      const src = `
        import result;

        let good = result.ok(42);
        let bad = result.err("disk full");

        print(result.is_ok(good));
        print(result.is_err(good));
        print(result.is_ok(bad));
        print(result.is_err(bad));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\nfalse\nfalse\ntrue");
    });

    test("STD-06: result.unwrap extracts value or throws on err", () => {
      const src = `
        import result;

        let good = result.ok("success");
        print(result.unwrap(good));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("success");

      const failSrc = `
        import result;
        let bad = result.err("connection reset");
        result.unwrap(bad);
      `;
      const failRes = run(failSrc);
      expect(failRes.ok).toBe(false);
      expect(failRes.error).toContain("connection reset");
    });

    test("STD-07: result.unwrap_or provides fallback value on err", () => {
      const src = `
        import result;

        let good = result.ok(10);
        let bad = result.err("failed");

        print(result.unwrap_or(good, 99));
        print(result.unwrap_or(bad, 99));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("10\n99");
    });

    test("STD-08: Safe division using Result pattern", () => {
      const src = `
        import result;

        fn safe_divide(a: Int, b: Int) -> any {
          if (b == 0) {
            return result.err("division by zero");
          }
          return result.ok(a / b);
        }

        let r1 = safe_divide(100, 4);
        let r2 = safe_divide(100, 0);

        print(result.unwrap_or(r1, -1));
        print(result.unwrap_or(r2, -1));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("25\n-1");
    });
  });
});
