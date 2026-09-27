/**
 * HKD 1.0 Conformance Suite: Type System Specification (tests/conformance/types.test.ts)
 *
 * Validates primitive types, runtime value tags, type conversions, type_of built-in,
 * null semantics, and semantic type checking.
 */

import { runSource } from "../../src/runtime/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { ErrorReporter } from "../../src/errors/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-types>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

function checkSemantics(src: string): { hasErrors: boolean; errors: string[] } {
  const reporter = new ErrorReporter(src, "<conformance-check>");
  const lexer = new Lexer(src, "<conformance-check>", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, src, "<conformance-check>", reporter);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, src);
  analyser.analyse(ast);
  return {
    hasErrors: reporter.hasErrors(),
    errors: reporter.getAll().map((d: any) => d.message),
  };
}

describe("HKD 1.0 Language Conformance — Type System Specification", () => {
  test("C-TYP-01: Integer Primitive Type and Arithmetic Operations", () => {
    const src = `
      let a = 20
      let b = 5
      print(a + b)
      print(a - b)
      print(a * b)
      print(a / b)
      print(a % b)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["25", "15", "100", "4", "0"]);
  });

  test("C-TYP-02: Float Primitive Type and Floating-Point Precision", () => {
    const src = `
      let x = 3.5
      let y = 1.25
      print(x + y)
      print(x * 2.0)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["4.75", "7"]);
  });

  test("C-TYP-03: Boolean Values and Logical Negation", () => {
    const src = `
      let t = true
      let f = false
      print(t)
      print(f)
      print(!t)
      print(!f)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "false", "false", "true"]);
  });

  test("C-TYP-04: String Primitives and String Concatenation", () => {
    const src = `
      let s1 = "HKD"
      let s2 = "1.0.0"
      print(s1 + " " + s2)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["HKD 1.0.0"]);
  });

  test("C-TYP-05: Null Literal and Equality Semantics", () => {
    const src = `
      let val = null
      print(val == null)
      print(val != null)
      print(val == 0)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "false", "false"]);
  });

  test("C-TYP-06: type_of() Built-in for All Canonical Types", () => {
    const src = `
      print(type_of(100))
      print(type_of(3.14))
      print(type_of("hello"))
      print(type_of(true))
      print(type_of(null))
      print(type_of([1, 2, 3]))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["Int", "Float", "String", "Bool", "null", "Array"]);
  });

  test("C-TYP-07: Explicit Conversion Built-ins (to_int, to_float, to_string)", () => {
    const src = `
      print(to_int("42") + 8)
      print(to_float("3.14") * 2.0)
      print(to_string(999) + " bottles")
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["50", "6.28", "999 bottles"]);
  });

  test("C-TYP-08: Heterogeneous Array Support", () => {
    const src = `
      let items = [1, "two", true, null]
      print(items[0])
      print(items[1])
      print(items[2])
      print(items[3] == null)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["1", "two", "true", "true"]);
  });

  test("C-TYP-09: Map/Object Dynamic Key Indexing", () => {
    const src = `
      let dict = { "version": "1.0", "stable": true, "code": 100 }
      print(dict["version"])
      print(dict["stable"])
      print(dict["code"])
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["1.0", "true", "100"]);
  });

  test("C-TYP-10: Semantic Analyser Type Validation for Annotated Declarations", () => {
    const validSrc = `
      let a: Int = 42
      let b: String = "valid"
      let c: Bool = true
    `;
    const check = checkSemantics(validSrc);
    expect(check.hasErrors).toBe(false);
  });
});
