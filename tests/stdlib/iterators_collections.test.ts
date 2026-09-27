/**
 * HKD 1.1 Iterators & Collections 2.0 Test Suite
 * (tests/stdlib/iterators_collections.test.ts)
 *
 * Tests the complete suite of functional iterators:
 * - array.map, array.filter, array.take, array.skip, array.zip, array.enumerate, array.any, array.all
 * - result.map, result.map_err, result.and_then, result.unwrap_err
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

describe("HKD 1.1 Iterators & Collections 2.0", () => {
  describe("Extended Functional Iterators", () => {
    test("ITER-01: array.map transforms elements via callback", () => {
      const src = `
        import array;
        fn square(x: Int) -> Int {
          return x * x;
        }
        let nums = [1, 2, 3, 4];
        let squared = array.map(nums, square);
        print(squared[0]);
        print(squared[1]);
        print(squared[2]);
        print(squared[3]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("1\n4\n9\n16");
    });

    test("ITER-02: array.filter retains matching elements", () => {
      const src = `
        import array;
        fn is_even(x: Int) -> Bool {
          return x % 2 == 0;
        }
        let nums = [1, 2, 3, 4, 5, 6];
        let evens = array.filter(nums, is_even);
        print(array.len(evens));
        print(evens[0]);
        print(evens[1]);
        print(evens[2]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("3\n2\n4\n6");
    });

    test("ITER-03: array.take and array.skip partition arrays cleanly", () => {
      const src = `
        import array;
        let items = [10, 20, 30, 40, 50];
        let first3 = array.take(items, 3);
        let after3 = array.skip(items, 3);
        print(array.len(first3));
        print(first3[2]);
        print(array.len(after3));
        print(after3[0]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("3\n30\n2\n40");
    });

    test("ITER-04: array.zip pairs two arrays", () => {
      const src = `
        import array;
        let keys = ["a", "b", "c"];
        let vals = [1, 2, 3, 4];
        let zipped = array.zip(keys, vals);
        print(array.len(zipped));
        print(zipped[0][0] + ":" + to_string(zipped[0][1]));
        print(zipped[2][0] + ":" + to_string(zipped[2][1]));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("3\na:1\nc:3");
    });

    test("ITER-05: array.enumerate produces [index, value] pairs", () => {
      const src = `
        import array;
        let fruits = ["apple", "banana"];
        let indexed = array.enumerate(fruits);
        print(to_string(indexed[0][0]) + "=" + indexed[0][1]);
        print(to_string(indexed[1][0]) + "=" + indexed[1][1]);
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("0=apple\n1=banana");
    });

    test("ITER-06: array.any and array.all aliases", () => {
      const src = `
        import array;
        fn pos(x: Int) -> Bool { return x > 0; }
        print(array.any([-1, 0, 5], pos));
        print(array.all([1, 2, 3], pos));
        print(array.all([1, -1, 3], pos));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("true\ntrue\nfalse");
    });
  });

  describe("Monadic Result Operations", () => {
    test("RES-01: result.map transforms Ok value only", () => {
      const src = `
        import result;
        fn add_one(x: Int) -> Int { return x + 1; }
        let ok_val = result.ok(10);
        let err_val = result.err("failed");
        let mapped_ok = result.map(ok_val, add_one);
        let mapped_err = result.map(err_val, add_one);
        print(result.unwrap(mapped_ok));
        print(result.is_err(mapped_err));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("11\ntrue");
    });

    test("RES-02: result.map_err transforms Err value only", () => {
      const src = `
        import result;
        fn prefix(e: String) -> String { return "ERR: " + e; }
        let ok_val = result.ok(42);
        let err_val = result.err("io_timeout");
        let m_ok = result.map_err(ok_val, prefix);
        let m_err = result.map_err(err_val, prefix);
        print(result.unwrap(m_ok));
        print(result.unwrap_err(m_err));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("42\nERR: io_timeout");
    });

    test("RES-03: result.and_then chains computations", () => {
      const src = `
        import result;
        fn safe_div(denom: Int) -> Result {
          if denom == 0 {
            return result.err("divide_by_zero");
          }
          return result.ok(100 / denom);
        }
        let step1 = result.ok(5);
        let step2 = result.and_then(step1, safe_div);
        print(result.unwrap(step2));

        let zero_step = result.ok(0);
        let err_step = result.and_then(zero_step, safe_div);
        print(result.is_err(err_step));
        print(result.unwrap_err(err_step));
      `;
      const res = run(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("20\ntrue\ndivide_by_zero");
    });
  });
});
