/**
 * HKD 1.1 Tooling Test Suite: Explain Tool
 * (tests/tooling/explain.test.ts)
 *
 * Tests the `hkd explain <error_code>` engine.
 */

import { explainError, ERROR_EXPLANATIONS } from "../../src/cli/explain.js";

describe("HKD 1.1 Tooling — Error Explanations (hkd explain)", () => {
  test("EXP-01: Explains existing error codes across all compiler phases", () => {
    const codes = ["E101", "E201", "E301", "E401", "E501", "E601"];
    for (const code of codes) {
      const explanation = explainError(code);
      expect(explanation).toContain(`[${code}]`);
      expect(explanation).toContain("Erroneous Code Example:");
      expect(explanation).toContain("Corrected Code Example:");
      expect(explanation).toContain("Learn more at https://hkd-lang.org/docs/errors/");
    }
  });

  test("EXP-02: Case-insensitive error code lookup", () => {
    const uppercase = explainError("E201");
    const lowercase = explainError("e201");
    expect(uppercase).toBe(lowercase);
  });

  test("EXP-03: Explains experimental feature gating error E201 with edition advice", () => {
    const exp = explainError("E201");
    expect(exp).toContain("Unexpected Token / Feature Gated");
    expect(exp).toContain("#feature");
    expect(exp).toContain("edition = \"2027\"");
  });

  test("EXP-04: Returns helpful suggestion and list when unknown error code is queried", () => {
    const res = explainError("E9999");
    expect(res).toContain("Error code `E9999` not found in the HKD explanation index.");
    expect(res).toContain("Available codes:");
    expect(res).toContain("E101");
    expect(res).toContain("E201");
  });

  test("EXP-05: Verifies all cataloged explanations have required fields", () => {
    for (const [code, entry] of Object.entries(ERROR_EXPLANATIONS)) {
      expect(entry.code).toBe(code);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.category).toBeDefined();
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.erroneousExample.length).toBeGreaterThan(0);
      expect(entry.fixedExample.length).toBeGreaterThan(0);
    }
  });
});
