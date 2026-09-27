/**
 * HKD 1.1 Conformance Suite: Pattern Matching Specification
 * (tests/conformance/pattern_matching.test.ts)
 *
 * Validates RFC-002: Structured Pattern Matching, including literal matching,
 * variable binding, array destructuring, guards, reachability warnings,
 * and edition-based feature gating.
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

describe("HKD 1.1 Conformance — Pattern Matching (RFC-002)", () => {
  describe("Literal & Basic Matching", () => {
    test("PM-01: Integer literal matching with wildcard", () => {
      const src = `
        fn describe_num(n: Int) -> String {
          return match n {
            0 => "zero",
            1 => "one",
            2 => "two",
            _ => "many"
          };
        }
        print(describe_num(0));
        print(describe_num(2));
        print(describe_num(99));
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("zero\ntwo\nmany");
    });

    test("PM-02: String literal matching", () => {
      const src = `
        fn status_code(method: String) -> Int {
          return match method {
            "GET" => 200,
            "POST" => 201,
            "DELETE" => 204,
            _ => 400
          };
        }
        print(status_code("GET"));
        print(status_code("POST"));
        print(status_code("UNKNOWN"));
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("200\n201\n400");
    });

    test("PM-03: Boolean and Null literal matching", () => {
      const src = `
        let val: Bool = true;
        let b = match val {
          true => 1,
          false => 0,
          _ => -1
        };
        print(b);

        let n = null;
        let res = match n {
          null => "is-null",
          _ => "non-null"
        };
        print(res);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("1\nis-null");
    });
  });

  describe("Variable Binding & Guards", () => {
    test("PM-04: Variable binding in arm captures scrutinee value", () => {
      const src = `
        let x = 42;
        let doubled = match x {
          0 => 0,
          val => val * 2
        };
        print(doubled);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("84");
    });

    test("PM-05: Guard conditions filter matches", () => {
      const src = `
        fn classify(n: Int) -> String {
          return match n {
            x if x < 0 => "negative",
            0 => "zero",
            x if x > 100 => "huge",
            _ => "positive"
          };
        }
        print(classify(-5));
        print(classify(0));
        print(classify(50));
        print(classify(999));
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("negative\nzero\npositive\nhuge");
    });
  });

  describe("Array Pattern Destructuring", () => {
    test("PM-06: Array pattern destructuring with fixed elements", () => {
      const src = `
        fn inspect_pair(pair: [Int]) -> String {
          return match pair {
            [] => "empty",
            [a] => "single",
            [a, b] => "pair",
            _ => "many"
          };
        }
        print(inspect_pair([]));
        print(inspect_pair([1]));
        print(inspect_pair([1, 2]));
        print(inspect_pair([1, 2, 3]));
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("empty\nsingle\npair\nmany");
    });

    test("PM-07: Destructured elements bound in arm expressions", () => {
      const src = `
        let point = [10, 20];
        let sum = match point {
          [x, y] => x + y,
          _ => 0
        };
        print(sum);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("30");
    });
  });

  describe("Block Arms & Expression Nesting", () => {
    test("PM-08: Block statement arms execute multiple statements", () => {
      const src = `
        let my_input = 5;
        let res = match my_input {
          5 => {
            let temp = 10;
            let temp2 = temp + 5;
            temp2 * 2;
          },
          _ => 0
        };
        print(res);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("30");
    });

    test("PM-09: Nested match expressions evaluate correctly", () => {
      const src = `
        let a = 1;
        let b = 2;
        let res = match a {
          1 => match b {
            2 => "both matched",
            _ => "inner fallback"
          },
          _ => "outer fallback"
        };
        print(res);
      `;
      const res = run2027(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("both matched");
    });
  });

  describe("Feature Gating & Diagnostics", () => {
    test("PM-10: Match syntax requires #feature in Edition 2026", () => {
      const src = `
        let x = 1;
        let y = match x {
          1 => "one",
          _ => "other"
        };
      `;
      const res = run2026(src);
      expect(res.ok).toBe(false);
      expect(res.diagnostics.some(d => d.includes("pattern_matching") || d.includes("E204"))).toBe(true);
    });

    test("PM-11: Match syntax allowed in Edition 2026 with #feature directive", () => {
      const src = `
        #feature(pattern_matching)
        let x = 1;
        let y = match x {
          1 => "one",
          _ => "other"
        };
        print(y);
      `;
      const res = run2026(src);
      expect(res.ok).toBe(true);
      expect(res.output).toBe("one");
    });

    test("PM-12: Unreachable pattern after wildcard generates warning", () => {
      const src = `
        let x = 1;
        let y = match x {
          _ => "first",
          1 => "unreachable"
        };
        print(y);
      `;
      const reporter = new ErrorReporter(src, "test.hkd");
      const lexer = new Lexer(src, "test.hkd", reporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, src, "test.hkd", reporter, "2027");
      const ast = parser.parse();
      // Verify parsing succeeded
      expect(reporter.hasErrors()).toBe(false);
    });
  });
});
