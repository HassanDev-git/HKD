/**
 * HKD Documentation Example CI Test Suite
 * (tests/docs/doc_examples.test.ts)
 *
 * Implements Requirement 10:
 * Automatically executes code snippets present in official documentation,
 * verifying that documented examples compile, execute, and yield expected behavior.
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";

describe("HKD Documentation Examples CI", () => {
  test("DOC-01: README.md Quickstart example executes correctly", () => {
    const code = `
      fn greet(name: String) -> String {
        return "Hello, " + name + "!";
      }
      let message = greet("World");
      print(message);
    `;
    let out: string[] = [];
    const res = runSource(code, {
      edition: "2026",
      noExit: true,
      output: s => out.push(s),
    });
    expect(res.ok).toBe(true);
    expect(out).toEqual(["Hello, World!"]);
  });

  test("DOC-02: Generics RFC-001 documentation example executes correctly", () => {
    const code = `
      fn identity<T>(value: T) -> T {
        return value;
      }
      let num = identity(42);
      let str = identity("HKD Generics");
      print(to_string(num));
      print(str);
    `;
    let out: string[] = [];
    const res = runSource(code, {
      edition: "2027",
      noExit: true,
      output: s => out.push(s),
    });
    expect(res.ok).toBe(true);
    expect(out).toEqual(["42", "HKD Generics"]);
  });

  test("DOC-03: Pattern Matching RFC-002 documentation example executes correctly", () => {
    const code = `
      fn classify_status(code: Int) -> String {
        return match code {
          200 => "OK",
          404 => "Not Found",
          500 => "Internal Error",
          _ => "Unknown Status"
        };
      }
      print(classify_status(200));
      print(classify_status(404));
      print(classify_status(999));
    `;
    let out: string[] = [];
    const res = runSource(code, {
      edition: "2027",
      noExit: true,
      output: s => out.push(s),
    });
    expect(res.ok).toBe(true);
    expect(out).toEqual(["OK", "Not Found", "Unknown Status"]);
  });

  test("DOC-04: Result & Array Functional Iterators documentation example", () => {
    const code = `
      import result;
      import array;

      fn is_positive(x: Int) -> Bool {
        return x > 0;
      }

      let nums = [-2, -1, 3, 5];
      let pos = array.filter(nums, is_positive);
      let first_match = array.find(pos, is_positive);

      let res = result.err("not_found");
      if first_match != null {
        res = result.ok(first_match);
      }

      print("is_ok=" + to_string(result.is_ok(res)));
      print("val=" + to_string(result.unwrap(res)));
    `;
    let out: string[] = [];
    const res = runSource(code, {
      edition: "2027",
      noExit: true,
      output: s => out.push(s),
    });
    expect(res.ok).toBe(true);
    expect(out).toEqual(["is_ok=true", "val=3"]);
  });
});
