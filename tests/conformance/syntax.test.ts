/**
 * HKD 1.0 Conformance Suite: Syntax Specification (tests/conformance/syntax.test.ts)
 *
 * Validates that the lexical structure and grammar of HKD Edition 2026 strictly
 * adhere to docs/grammar.md and docs/language-reference.md.
 */

import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { TokenKind } from "../../src/lexer/token.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { runSource } from "../../src/runtime/index.js";

function parse(source: string) {
  const reporter = new ErrorReporter(source, "<conformance-syntax>");
  const lexer = new Lexer(source, "<conformance-syntax>", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "<conformance-syntax>", reporter);
  const ast = parser.parse();
  return { ast, reporter };
}

describe("HKD 1.0 Language Conformance — Syntax Specification", () => {
  test("C-SYN-01: Integer, Float, and Negative Numeric Literals", () => {
    const { ast, reporter } = parse("let a = 42;\nlet b = 3.14159;\nlet c = -100;");
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(3);
  });

  test("C-SYN-02: String Literals with Standard Escape Sequences", () => {
    const { ast, reporter } = parse(`let s = "Hello,\\n\\tWorld! \\"escaped\\" \\\\\\\\";`);
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(1);
  });

  test("C-SYN-03: Boolean and Null Literals", () => {
    const { ast, reporter } = parse("let t = true;\nlet f = false;\nlet n = null;");
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(3);
  });

  test("C-SYN-04: Identifiers with ASCII and Snake/Camel Casing", () => {
    const { ast, reporter } = parse("let my_var = 1;\nlet camelCase = 2;\nlet _private = 3;");
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(3);
  });

  test("C-SYN-05: Single-line and Multi-line Comments", () => {
    const source = `
      // Single line comment
      let x = 10;
      /* Multi-line comment
         spanning multiple lines */
      let y = 20;
    `;
    const { ast, reporter } = parse(source);
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(2);
  });

  test("C-SYN-06: Operator Precedence (Multiplication before Addition)", () => {
    const output: string[] = [];
    const res = runSource("print(2 + 3 * 4);", { output: (s) => output.push(s) });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["14"]);
  });

  test("C-SYN-07: Parenthesized Expressions Override Precedence", () => {
    const output: string[] = [];
    const res = runSource("print((2 + 3) * 4);", { output: (s) => output.push(s) });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["20"]);
  });

  test("C-SYN-08: Logical and Comparison Operator Precedence", () => {
    const output: string[] = [];
    const res = runSource("print(5 > 3 && 2 < 4); print(1 == 2 || 3 == 3);", {
      output: (s) => output.push(s),
    });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["true", "true"]);
  });

  test("C-SYN-09: Array Literal Syntax and Indexing", () => {
    const output: string[] = [];
    const res = runSource("let arr = [10, 20, 30]; print(arr[1]);", {
      output: (s) => output.push(s),
    });
    expect(res.ok).toBe(true);
    expect(output).toEqual(["20"]);
  });

  test("C-SYN-10: Struct Declaration Syntax", () => {
    const { ast, reporter } = parse("struct Point {\n  x: Int\n  y: Int\n}");
    expect(reporter.hasErrors()).toBe(false);
    expect(ast.statements.length).toBe(1);
    expect(ast.statements[0].kind).toBe("StructDeclStmt");
  });
});
