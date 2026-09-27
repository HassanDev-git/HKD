/**
 * HKD Post-1.0 Continuous Fuzzing & Crash Regression Suite
 *
 * Verifies that historical fuzzing regression fixtures and randomized mutations
 * never cause unhandled crashes, memory violations, or fatal process terminations.
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { ErrorReporter } from "../../src/errors/index.js";

describe("HKD Continuous Fuzzing Regressions", () => {
  const regressionsDir = path.resolve("fuzz/regressions");

  test("all recorded regression fixtures terminate safely with zero unhandled crashes", () => {
    expect(fs.existsSync(regressionsDir)).toBe(true);
    const files = fs.readdirSync(regressionsDir).filter((f) => f.endsWith(".hkd"));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const filePath = path.join(regressionsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      let didThrow = false;
      try {
        const res = runSource(content, { printDiagnostics: false });
        // The result is either clean success or structured error report
        expect(typeof res.ok).toBe("boolean");
        if (!res.ok) {
          expect(res.diagnostics.length).toBeGreaterThan(0);
        }
      } catch (err) {
        didThrow = true;
      }
      expect(didThrow).toBe(false);
    }
  });

  test("randomized byte mutations across grammar corpus do not trigger unhandled process exits", () => {
    const seed = 'fn calc(a, b) { let res = (a + b) * 2; return res; }\nlet val = calc(10, 20);\n';

    for (let iteration = 0; iteration < 25; iteration++) {
      // Mutate seed by inserting random symbols, unclosed braces, or truncating
      let mutated = seed;
      const mutationType = iteration % 4;

      if (mutationType === 0) {
        // Truncate at random index
        mutated = mutated.slice(0, Math.floor(Math.random() * mutated.length));
      } else if (mutationType === 1) {
        // Insert unclosed symbols
        mutated = mutated.replace("(", "((((((((").replace("{", "{{{{{{{{");
      } else if (mutationType === 2) {
        // Insert invalid punctuation
        mutated = mutated + "@#$!^&*~`|\\";
      } else {
        // Insert unicode control characters
        mutated = "\u0000\u0001" + mutated + "\uFFFF\uFFFE";
      }

      let threwFatal = false;
      try {
        const reporter = new ErrorReporter(mutated, `<fuzz_${iteration}>`);
        const lexer = new Lexer(mutated, `<fuzz_${iteration}>`, reporter);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, mutated, `<fuzz_${iteration}>`, reporter);
        parser.parse();
      } catch {
        threwFatal = true;
      }

      // Parser and lexer gracefully catch errors into reporter
      expect(threwFatal).toBe(false);
    }
  });
});
