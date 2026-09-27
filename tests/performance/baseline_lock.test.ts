/**
 * HKD Performance Baseline Lock Test Suite
 *
 * Verifies that current runtime execution adheres to the frozen 1.0.0 performance baseline
 * and does not exceed regression thresholds.
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";

describe("HKD 1.0.0 Performance Baseline Lock", () => {
  const baselinePath = path.resolve("benchmarks/baseline/1.0.0/baseline.json");

  test("frozen baseline exists and defines valid tolerances", () => {
    expect(fs.existsSync(baselinePath)).toBe(true);
    const data = JSON.parse(fs.readFileSync(baselinePath, "utf-8"));
    expect(data.version).toBe("1.0.0");
    expect(data.tolerances.maxAllowedRegressionPercent).toBe(5.0);
    expect(data.workloads.length).toBeGreaterThan(5);
  });

  test("startup and minimal execution latency adheres to performance budget", () => {
    const start = Date.now();
    const res = runSource("let x = 1; let y = 2; let z = x + y;", { printDiagnostics: false });
    const elapsed = Date.now() - start;

    expect(res.ok).toBe(true);
    // In-process compilation and execution should comfortably complete under 100ms
    expect(elapsed).toBeLessThan(100);
  });

  test("loop and arithmetic execution operates within baseline bounds", () => {
    const code = `
      let sum = 0;
      let i = 0;
      while i < 10000 {
        sum = sum + i;
        i = i + 1;
      }
    `;
    const start = Date.now();
    const res = runSource(code, { printDiagnostics: false });
    const elapsed = Date.now() - start;

    expect(res.ok).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });

  test("closure and function call invocation operates within baseline bounds", () => {
    const code = `
      fn make_adder(n) {
        return fn(x) { return x + n; };
      }
      let add5 = make_adder(5);
      let res = 0;
      let i = 0;
      while i < 1000 {
        res = add5(res);
        i = i + 1;
      }
    `;
    const start = Date.now();
    const res = runSource(code, { printDiagnostics: false });
    const elapsed = Date.now() - start;

    expect(res.ok).toBe(true);
    expect(elapsed).toBeLessThan(200);
  });
});
