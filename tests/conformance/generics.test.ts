/**
 * HKD 1.1 Conformance Suite: Generics Specification
 * (tests/conformance/generics.test.ts)
 *
 * Validates RFC-001: First-Class Generic Functions, call-site type argument
 * inference, explicit type parameter application, and edition gating.
 */

import { runSource } from "../../src/runtime/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { ErrorReporter } from "../../src/errors/index.js";

function run2027(source: string) {
  let outputText = "";
  const result = runSource(source, {
    edition: "2027",
    noExit: true,
    output: (s: string) => {
      outputText += s + "\n";
    },
  });
  return { ...result, output: outputText.trim() };
}

function run2026(source: string) {
  let outputText = "";
  const result = runSource(source, {
    edition: "2026",
    noExit: true,
    output: (s: string) => {
      outputText += s + "\n";
    },
  });
  return { ...result, output: outputText.trim() };
}

describe("HKD 1.1 Conformance — Generics (RFC-001)", () => {
  describe("Generic Function Declarations & Calls", () => {
    test("GEN-01: Identity generic function preserves value and type", () => {
      const src = `
        fn id<T>(x: T) -> T {
          return x;
        }
        let a = id(42);
        let b = id("hello");
        let c = id(true);
        print(a);
        print(b);
        print(c);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("42\nhello\ntrue");
    });

    test("GEN-02: Explicit type arguments at call site", () => {
      const src = `
        fn wrap<T>(val: T) -> [T] {
          return [val];
        }
        let arr = wrap<Int>(100);
        print(arr[0]);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("100");
    });

    test("GEN-03: Multiple generic type parameters", () => {
      const src = `
        fn first<A, B>(a: A, b: B) -> A {
          return a;
        }
        fn second<A, B>(a: A, b: B) -> B {
          return b;
        }
        print(first(10, "HKD"));
        print(second(10, "HKD"));
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("10\nHKD");
    });

    test("GEN-04: Higher-order generic function composition", () => {
      const src = `
        fn apply<T, R>(f: fn(T) -> R, val: T) -> R {
          return f(val);
        }
        fn double(n: Int) -> Int {
          return n * 2;
        }
        let res = apply(double, 21);
        print(res);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("42");
    });
  });

  describe("Feature Gating & Edition Diagnostics", () => {
    test("GEN-05: Generics require #feature(generics) in Edition 2026", () => {
      const src = `
        fn id<T>(x: T) -> T {
          return x;
        }
      `;
      const res = run2026(src);
      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.includes("generics") || d.includes("E201"))).toBe(true);
    });

    test("GEN-06: Generics allowed in Edition 2026 with #feature directive", () => {
      const src = `
        #feature(generics)
        fn id<T>(x: T) -> T {
          return x;
        }
        print(id(999));
      `;
      const res = run2026(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("999");
    });

    test("GEN-07: AST representation includes type parameters", () => {
      const src = `
        fn swap<A, B>(a: A, b: B) -> [A] {
          return [a];
        }
      `;
      const reporter = new ErrorReporter(src, "gen_ast.hkd");
      const lexer = new Lexer(src, "gen_ast.hkd", reporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, src, "gen_ast.hkd", reporter, "2027");
      const ast = parser.parse();

      expect(reporter.hasErrors()).toBe(false);
      const fnDecl = ast.statements[0] as any;
      expect(fnDecl.kind).toBe("FunctionDeclStmt");
      expect(fnDecl.typeParams).toBeDefined();
      expect(fnDecl.typeParams.length).toBe(2);
      expect(fnDecl.typeParams[0]).toBe("A");
      expect(fnDecl.typeParams[1]).toBe("B");
    });
  });
});
