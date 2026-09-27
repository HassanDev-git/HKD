/**
 * HKD Backward-Compatibility Golden Corpus Test Suite
 * (tests/compatibility/golden/golden_corpus.test.ts)
 *
 * Verifies that real Edition 2026 programs execute with 100% identical outputs
 * across HKD 1.0 (Edition 2026 mode) and HKD 1.1 (Edition 2027 mode).
 */

import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../../src/runtime/index.js";

describe("HKD Backward-Compatibility — Golden Corpus", () => {
  const dir = path.resolve(__dirname);

  test("GOLDEN-01: data_structures_2026.hkd parity across editions", () => {
    const code = fs.readFileSync(path.join(dir, "data_structures_2026.hkd"), "utf-8");

    let out2026: string[] = [];
    const res2026 = runSource(code, {
      edition: "2026",
      noExit: true,
      output: s => out2026.push(s),
    });
    expect(res2026.ok).toBe(true);

    let out2027: string[] = [];
    const res2027 = runSource(code, {
      edition: "2027",
      noExit: true,
      output: s => out2027.push(s),
    });
    expect(res2027.ok).toBe(true);

    expect(out2026.join("\n")).toBe("count=2\nuser1=Alice\nuser2=Bob");
    expect(out2026).toEqual(out2027);
  });

  test("GOLDEN-02: math_and_logic_2026.hkd parity across editions", () => {
    const code = fs.readFileSync(path.join(dir, "math_and_logic_2026.hkd"), "utf-8");

    let out2026: string[] = [];
    const res2026 = runSource(code, {
      edition: "2026",
      noExit: true,
      output: s => out2026.push(s),
    });
    expect(res2026.ok).toBe(true);

    let out2027: string[] = [];
    const res2027 = runSource(code, {
      edition: "2027",
      noExit: true,
      output: s => out2027.push(s),
    });
    expect(res2027.ok).toBe(true);

    expect(out2026.join("\n")).toBe("fib_10=55\nlogic_valid=true");
    expect(out2026).toEqual(out2027);
  });
});
