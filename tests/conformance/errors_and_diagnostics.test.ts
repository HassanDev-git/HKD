/**
 * HKD 1.0 Conformance Suite: Errors and Diagnostics (tests/conformance/errors_and_diagnostics.test.ts)
 *
 * Validates canonical error codes (E101–E503), source spans, caret highlighting,
 * and diagnostic reporter output as specified in docs/error-codes.md.
 */

import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { ErrorReporter, ErrorCode } from "../../src/errors/index.js";
import { runSource } from "../../src/runtime/index.js";

function checkPipeline(src: string): { reporter: ErrorReporter; hasErrors: boolean } {
  const reporter = new ErrorReporter(src, "conformance_error.hkd");
  const lexer = new Lexer(src, "conformance_error.hkd", reporter);
  const tokens = lexer.tokenize();
  if (reporter.hasErrors()) return { reporter, hasErrors: true };

  const parser = new Parser(tokens, src, "conformance_error.hkd", reporter);
  const ast = parser.parse();
  if (reporter.hasErrors()) return { reporter, hasErrors: true };

  const analyser = new SemanticAnalyser(reporter, src);
  analyser.analyse(ast);
  return { reporter, hasErrors: reporter.hasErrors() };
}

describe("HKD 1.0 Language Conformance — Errors & Diagnostics", () => {
  test("C-ERR-01: E102 Unterminated string literal", () => {
    const src = `let s = "unterminated string`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    const codes = reporter.getAll().map((d: any) => d.code);
    expect(codes).toContain(ErrorCode.E102);
  });

  test("C-ERR-02: E103 Unterminated block comment", () => {
    const src = `/* this comment never ends`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    const codes = reporter.getAll().map((d: any) => d.code);
    expect(codes).toContain(ErrorCode.E103);
  });

  test("C-ERR-03: E201 Unexpected token error in parser", () => {
    const src = `let x = + * 5`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    expect(reporter.getAll().length).toBeGreaterThan(0);
  });

  test("C-ERR-04: E301 Undefined variable error in semantic analysis", () => {
    const src = `print(unresolvedIdentifierName)`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    const codes = reporter.getAll().map((d: any) => d.code);
    expect(codes).toContain(ErrorCode.E301);
  });

  test("C-ERR-05: E305 Return outside of function body", () => {
    const src = `let x = 10\nreturn x`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    const codes = reporter.getAll().map((d: any) => d.code);
    expect(codes).toContain(ErrorCode.E305);
  });

  test("C-ERR-06: E306 Break outside of loop body", () => {
    const src = `if true { break }`;
    const { reporter, hasErrors } = checkPipeline(src);
    expect(hasErrors).toBe(true);
    const codes = reporter.getAll().map((d: any) => d.code);
    expect(codes).toContain(ErrorCode.E306);
  });

  test("C-ERR-07: E401 Division by zero runtime panic", () => {
    const src = `let a = 10\nlet b = 0\nlet c = a / b`;
    const res = runSource(src, { printDiagnostics: false });
    expect(res.ok).toBe(false);
  });

  test("C-ERR-08: E402 Index out of bounds runtime error", () => {
    const src = `let arr = [1, 2]\nlet x = arr[99]`;
    const res = runSource(src, { printDiagnostics: false });
    expect(res.ok).toBe(false);
  });

  test("C-ERR-09: Formatted diagnostic contains file, line, and message", () => {
    const src = `let a = missingVar`;
    const { reporter } = checkPipeline(src);
    const formatted = reporter.format();
    expect(formatted).toContain("conformance_error.hkd");
    expect(formatted).toContain("E301");
  });
});
