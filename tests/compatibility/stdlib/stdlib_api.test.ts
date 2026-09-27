/**
 * HKD Standard Library API Stability Suite
 *
 * Verifies that all stable stdlib modules export expected methods and
 * maintain predictable behavior.
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../../src/runtime/index.js";

describe("HKD Standard Library API Contract", () => {
  test("std.math module exports mathematical constants and operations", () => {
    const output: string[] = [];
    const code = `
      import math;
      print(math.sqrt(16));
      print(math.abs(-42));
      print(math.min(10, 20));
      print(math.max(10, 20));
      print(math.pow(2, 8));
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["4", "42", "10", "20", "256"]);
  });

  test("std.string module functions execute properly", () => {
    const output: string[] = [];
    const code = `
      import string;
      print(string.upper("hello"));
      print(string.lower("WORLD"));
      print(string.trim("  hkd  "));
      print(string.contains("abcdef", "cd"));
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["HELLO", "world", "hkd", "true"]);
  });

  test("std.json module parse and stringify", () => {
    const output: string[] = [];
    const code = `
      import json;
      let raw = "[1, 2, 3]";
      let parsed = json.parse(raw);
      print(len(parsed));
      let back = json.stringify(parsed);
      print(back);
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output[0]).toBe("3");
    expect(output[1]).toBe("[1,2,3]");
  });

  test("std.path module functions execute properly", () => {
    const output: string[] = [];
    const code = `
      import path;
      let p = path.join("foo", "bar", "baz.hkd");
      print(path.extname(p));
      print(path.basename(p));
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output[0]).toBe(".hkd");
    expect(output[1]).toBe("baz.hkd");
  });

  test("std.http client and metrics", () => {
    const output: string[] = [];
    const code = `
      import http;
      let res = http.get("127.0.0.1", 8080, "/health");
      print(res.status);
      let m = http.metrics();
      print(m.status);
    `;
    const res = runSource(code, { output: (s) => output.push(s), printDiagnostics: false });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["200", "ok"]);
  });
});
