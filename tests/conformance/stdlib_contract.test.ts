/**
 * HKD 1.0 Conformance Suite: Standard Library Contract (tests/conformance/stdlib_contract.test.ts)
 *
 * Validates the core standard library modules (math, string, array, json, path, env, random)
 * conform strictly to the HKD 1.0 Specification.
 */

import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-stdlib>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("HKD 1.0 Language Conformance — Standard Library Contract", () => {
  test("C-LIB-01: math module arithmetic functions", () => {
    const src = `
      import math
      print(math.abs(-100))
      print(math.sqrt(64))
      print(math.min(15, 8))
      print(math.max(15, 8))
      print(math.pow(3, 3))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["100", "8", "8", "15", "27"]);
  });

  test("C-LIB-02: math rounding functions", () => {
    const src = `
      import math
      print(math.floor(3.9))
      print(math.ceil(3.1))
      print(math.round(3.5))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3", "4", "4"]);
  });

  test("C-LIB-03: string transformation and case methods", () => {
    const src = `
      import string
      print(string.upper("hello"))
      print(string.lower("WORLD"))
      print(string.trim("  hkd  "))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["HELLO", "world", "hkd"]);
  });

  test("C-LIB-04: string search and predicates", () => {
    const src = `
      import string
      print(string.contains("release-1.0", "1.0"))
      print(string.starts_with("hkd-lang", "hkd"))
      print(string.ends_with("archive.hkdpack", ".hkdpack"))
      print(string.replace("foo bar", "bar", "baz"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "true", "true", "foo baz"]);
  });

  test("C-LIB-05: array module mutators and transformations", () => {
    const src = `
      import array
      let list = [1, 2]
      array.push(list, 3)
      print(array.len(list))
      let last = array.pop(list)
      print(last)
      print(array.join(list, ","))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3", "3", "1,2"]);
  });

  test("C-LIB-06: json serialization and round-trip parsing", () => {
    const src = `
      import json
      let payload = { "service": "api", "port": 8080 }
      let jsonText = json.stringify(payload)
      let parsed = json.parse(jsonText)
      print(parsed.service)
      print(parsed.port)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["api", "8080"]);
  });

  test("C-LIB-07: path manipulation utilities", () => {
    const src = `
      import path
      print(path.basename("dir/sub/file.hkd"))
      print(path.extname("archive.tar.gz"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["file.hkd", ".gz"]);
  });

  test("C-LIB-08: env module get and set variables", () => {
    const src = `
      import env
      env.set("HKD_CONFORMANCE_KEY", "hkd_verified")
      print(env.get("HKD_CONFORMANCE_KEY"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["hkd_verified"]);
  });

  test("C-LIB-09: random module range and float invariants", () => {
    const src = `
      import random
      let f = random.float()
      let i = random.int(50, 100)
      print(f >= 0.0 && f <= 1.0)
      print(i >= 50 && i <= 100)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "true"]);
  });

  test("C-LIB-10: built-in len and type_of functions", () => {
    const src = `
      print(len("test"))
      print(len([1, 2, 3, 4, 5]))
      print(type_of(true))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["4", "5", "Bool"]);
  });
});
