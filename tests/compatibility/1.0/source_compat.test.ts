/**
 * HKD 1.0 Source Compatibility Test Suite
 *
 * Verifies that HKD 1.0 source constructs retain identical syntax and semantics.
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../../src/runtime/index.js";

describe("HKD 1.0 Source Compatibility Suite", () => {
  test("truthiness and short-circuit evaluation semantics", () => {
    const output: string[] = [];
    const code = `
      let a = true;
      let b = false;
      if a || b {
        print("or_passed");
      }
      if a && !b {
        print("and_passed");
      }
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["or_passed", "and_passed"]);
  });

  test("built-in global functions len, type_of, to_string, to_int, to_float, to_bool", () => {
    const output: string[] = [];
    const code = `
      let s = "hello";
      let arr = [1, 2, 3];
      print(len(s));
      print(len(arr));
      print(type_of(s));
      print(type_of(arr));
      print(to_string(42));
      print(to_int("100"));
      print(to_float("3.14"));
      print(to_bool(1));
      print(to_bool(0));
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual([
      "5",
      "3",
      "String",
      "Array",
      "42",
      "100",
      "3.14",
      "true",
      "false",
    ]);
  });

  test("nested lexical scope shadowing and capture", () => {
    const output: string[] = [];
    const code = `
      let x = "outer";
      {
        let x = "inner";
        print(x);
      }
      print(x);
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["inner", "outer"]);
  });

  test("array indexing and mutation semantics", () => {
    const output: string[] = [];
    const code = `
      let nums = [10, 20, 30];
      print(nums[1]);
      nums[1] = 99;
      print(nums[1]);
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["20", "99"]);
  });

  test("tail recursion and iterative loops calculate correctly", () => {
    const output: string[] = [];
    const code = `
      fn sum_tail(n, acc) {
        if n <= 0 {
          return acc;
        }
        return sum_tail(n - 1, acc + n);
      }
      print(sum_tail(10, 0));
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["55"]);
  });
});
