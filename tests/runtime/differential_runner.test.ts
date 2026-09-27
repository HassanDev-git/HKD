/**
 * HKD Differential Runner Tests (tests/runtime/differential_runner.test.ts)
 *
 * Validates the differential testing engine across Stack VM and Native runtime.
 */

import * as fs from "fs";
import * as path from "path";
import { runDifferentialProgram, runDifferentialSuite } from "../../src/tooling/differential.js";

describe("HKD Differential Testing Engine", () => {
  test("runs differential program and verifies equivalence", () => {
    const src = `
      let a = 10
      let b = 20
      print(a + b)
    `;
    const res = runDifferentialProgram(src, "diff_simple_add");
    expect(res.equivalent).toBe(true);
    expect(res.vmOutput).toBe("30");
    if (res.nativeOutput !== undefined) {
      expect(res.nativeOutput).toBe("30");
    }
  });

  test("verifies loop and branching equivalence", () => {
    const src = `
      let sum = 0
      let i = 0
      while i < 5 {
        sum = sum + i
        i = i + 1
      }
      print(sum)
    `;
    const res = runDifferentialProgram(src, "diff_while_loop");
    expect(res.equivalent).toBe(true);
    expect(res.vmOutput).toBe("10");
  });

  test("runs differential suite and saves report to reports/differential-final.json", () => {
    const suite = [
      { name: "prog1", source: "print(100 * 2)" },
      { name: "prog2", source: "print(10 > 5)" },
    ];
    const report = runDifferentialSuite(suite);
    expect(report.totalTested).toBe(2);
    expect(report.allEquivalent).toBe(true);

    const reportPath = path.resolve("reports", "differential-final.json");
    expect(fs.existsSync(reportPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(content.totalTested).toBe(2);
    expect(content.results.length).toBe(2);
  });
});
