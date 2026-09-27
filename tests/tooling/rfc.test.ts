/**
 * HKD 1.1 Tooling Test Suite: RFC Validator
 * (tests/tooling/rfc.test.ts)
 *
 * Tests the RFC listing, validation, and status reporting engine (`hkd rfc`).
 */

import * as path from "path";
import { RfcValidator, MANDATORY_RFC_SECTIONS } from "../../src/tooling/rfc-validator.js";

describe("HKD 1.1 Tooling — RFC System (hkd rfc)", () => {
  const rfcsDir = path.resolve(__dirname, "../../rfcs");
  const validator = new RfcValidator(rfcsDir);

  test("RFC-01: Discovers and parses all RFCs in rfcs/ directory", () => {
    const rfcs = validator.getAllRfcs();
    expect(rfcs.length).toBeGreaterThanOrEqual(5);

    const ids = rfcs.map((r) => r.id);
    expect(ids).toContain("001");
    expect(ids).toContain("002");
    expect(ids).toContain("003");
    expect(ids).toContain("004");
    expect(ids).toContain("005");
  });

  test("RFC-02: All master RFCs (001-005) pass mandatory section checks", () => {
    const rfcs = validator.getAllRfcs();
    for (const rfc of rfcs) {
      expect(rfc.isValid).toBe(true);
      expect(rfc.missingSections.length).toBe(0);
      expect(rfc.sections.length).toBeGreaterThanOrEqual(MANDATORY_RFC_SECTIONS.length);
    }
  });

  test("RFC-03: listRfcs produces structured tabular output", () => {
    const output = validator.listRfcs();
    expect(output).toContain("HKD Language Evolution RFCs");
    expect(output).toContain("001");
    expect(output).toContain("002");
    expect(output).toContain("003");
    expect(output).toContain("004");
    expect(output).toContain("005");
    expect(output).toContain("hkd rfc check");
  });

  test("RFC-04: checkRfc validates single and all RFCs", () => {
    const checkSingle = validator.checkRfc("001");
    expect(checkSingle).toContain("RFC [001]");
    expect(checkSingle).toContain("RFC Conformance Status: PASS");

    const checkAll = validator.checkRfc("all");
    expect(checkAll).toContain("RFC [001]");
    expect(checkAll).toContain("RFC [002]");
    expect(checkAll).toContain("RFC [003]");
    expect(checkAll).toContain("RFC [004]");
    expect(checkAll).toContain("RFC [005]");
    expect(checkAll).toContain("All 5 RFCs pass conformance validation");
  });

  test("RFC-05: statusRfc reports compiler implementation state", () => {
    const status001 = validator.statusRfc("001");
    expect(status001).toContain("Generic");
    expect(status001).toContain("Status:");

    const status002 = validator.statusRfc("002");
    expect(status002).toContain("Pattern Matching");
  });

  test("RFC-06: Gracefully reports nonexistent RFC", () => {
    const notFound = validator.checkRfc("999");
    expect(notFound).toContain("RFC '999' not found");
  });
});
