/**
 * HKD Error Codes Immutability & Contractual Stability Suite
 *
 * Verifies that all canonical ErrorCode values (E101–E604) remain strictly immutable
 * throughout the 1.0.x lifecycle.
 */

import { describe, test, expect } from "@jest/globals";
import { ErrorCode, ErrorReporter } from "../../../src/errors/index.js";
import { Lexer } from "../../../src/lexer/lexer.js";
import { Parser } from "../../../src/parser/parser.js";
import { runSource } from "../../../src/runtime/index.js";

describe("HKD Canonical Error Codes Stability (E101–E604)", () => {
  test("all canonical error codes exist and match expected identifiers", () => {
    // Lexer
    expect(ErrorCode.E101).toBe("E101");
    expect(ErrorCode.E102).toBe("E102");
    expect(ErrorCode.E103).toBe("E103");
    expect(ErrorCode.E104).toBe("E104");
    expect(ErrorCode.E105).toBe("E105");

    // Parser
    expect(ErrorCode.E201).toBe("E201");
    expect(ErrorCode.E202).toBe("E202");
    expect(ErrorCode.E203).toBe("E203");
    expect(ErrorCode.E204).toBe("E204");
    expect(ErrorCode.E205).toBe("E205");
    expect(ErrorCode.E206).toBe("E206");

    // Semantics
    expect(ErrorCode.E301).toBe("E301");
    expect(ErrorCode.E302).toBe("E302");
    expect(ErrorCode.E303).toBe("E303");
    expect(ErrorCode.E304).toBe("E304");
    expect(ErrorCode.E305).toBe("E305");
    expect(ErrorCode.E306).toBe("E306");
    expect(ErrorCode.E307).toBe("E307");
    expect(ErrorCode.E308).toBe("E308");
    expect(ErrorCode.E309).toBe("E309");
    expect(ErrorCode.E310).toBe("E310");

    // Runtime
    expect(ErrorCode.E401).toBe("E401");
    expect(ErrorCode.E402).toBe("E402");
    expect(ErrorCode.E403).toBe("E403");
    expect(ErrorCode.E404).toBe("E404");
    expect(ErrorCode.E405).toBe("E405");
    expect(ErrorCode.E406).toBe("E406");
    expect(ErrorCode.E407).toBe("E407");
    expect(ErrorCode.E408).toBe("E408");

    // VM
    expect(ErrorCode.E501).toBe("E501");
    expect(ErrorCode.E502).toBe("E502");
    expect(ErrorCode.E503).toBe("E503");

    // Package Manager
    expect(ErrorCode.E601).toBe("E601");
    expect(ErrorCode.E602).toBe("E602");
    expect(ErrorCode.E603).toBe("E603");
    expect(ErrorCode.E604).toBe("E604");
  });

  test("no duplicate error codes exist in ErrorCode enum", () => {
    const values = Object.values(ErrorCode);
    const unique = new Set(values);
    expect(values.length).toBe(unique.size);
  });

  test("lexer generates E102 for unterminated string literal", () => {
    const src = '"unterminated string';
    const reporter = new ErrorReporter(src, "test.hkd");
    const lexer = new Lexer(src, "test.hkd", reporter);
    lexer.tokenize();
    expect(reporter.hasErrors()).toBe(true);
    const diags = reporter.getAll();
    expect(diags.some((d) => d.code === ErrorCode.E102)).toBe(true);
  });

  test("parser generates E201 or E202 for malformed statement", () => {
    const src = "let = ;";
    const reporter = new ErrorReporter(src, "test.hkd");
    const lexer = new Lexer(src, "test.hkd", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, src, "test.hkd", reporter);
    parser.parse();
    expect(reporter.hasErrors()).toBe(true);
    const diags = reporter.getAll();
    expect(diags.some((d) => d.code === ErrorCode.E201 || d.code === ErrorCode.E202)).toBe(true);
  });
});
