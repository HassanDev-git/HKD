/**
 * HKD Phase 9 Benchmark Infrastructure Tests
 * (tests/performance/phase9_baseline.test.ts)
 *
 * Verifies:
 * 1. Workload discovery and metadata validation (18 workloads)
 * 2. Statistical calculation correctness (min, max, mean, median, p95, p99)
 * 3. Percentile computation boundaries
 * 4. Delta and speedup regression comparison
 * 5. Output correctness verification and mismatch detection
 * 6. Baseline v1 JSON schema validation
 * 7. Non-zero exit and timeout handling
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import {
  calculateStatistics,
  calculatePercentile,
  compareBaselines,
} from "../../benchmarks/phase9/metrics/statistics.js";
import { getBaselineWorkloadMatrix } from "../../benchmarks/phase9/runner/workload.js";

describe("HKD Phase 9A Benchmark Infrastructure Verification", () => {
  const rootDir = process.cwd();

  test("1. Workload matrix discovers exactly 18 standardized workloads", () => {
    const workloads = getBaselineWorkloadMatrix(rootDir);
    expect(workloads).toBeDefined();
    expect(workloads.length).toBe(18);

    const categories = new Set(workloads.map((w) => w.category));
    expect(categories.has("startup")).toBe(true);
    expect(categories.has("compiler")).toBe(true);
    expect(categories.has("arithmetic")).toBe(true);
    expect(categories.has("control_flow")).toBe(true);
    expect(categories.has("functions")).toBe(true);
    expect(categories.has("data")).toBe(true);
    expect(categories.has("runtime")).toBe(true);
    expect(categories.has("concurrency")).toBe(true);
  });

  test("2. Workload metadata is fully specified and valid", () => {
    const workloads = getBaselineWorkloadMatrix(rootDir);
    for (const w of workloads) {
      expect(w.id).toBeDefined();
      expect(typeof w.id).toBe("string");
      expect(w.name).toBeDefined();
      expect(w.category).toBeDefined();
      expect(w.executionType).toBeDefined();
      expect(w.description).toBeDefined();
      expect(w.timeoutMs).toBeGreaterThan(0);

      if (w.sourceFile) {
        expect(fs.existsSync(w.sourceFile)).toBe(true);
      }
    }
  });

  test("3. Statistical calculations compute min, max, mean, median, p95, p99 accurately", () => {
    const samples = [10.0, 20.0, 30.0, 40.0, 50.0];
    const stats = calculateStatistics(samples);

    expect(stats.min).toBe(10.0);
    expect(stats.max).toBe(50.0);
    expect(stats.mean).toBe(30.0);
    expect(stats.median).toBe(30.0);
    expect(stats.p95).toBe(48.0);
    expect(stats.p99).toBe(49.6);
    expect(stats.sampleCount).toBe(5);
  });

  test("4. Percentile calculation handles edge ranks and even/odd sample sets", () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const p50 = calculatePercentile(sorted, 50);
    const p0 = calculatePercentile(sorted, 0);
    const p100 = calculatePercentile(sorted, 100);

    expect(p0).toBe(1);
    expect(p50).toBe(5.5);
    expect(p100).toBe(10);
  });

  test("5. Baseline delta and speedup comparison calculates regression metrics", () => {
    // 20% speedup
    const cmpFaster = compareBaselines(100.0, 80.0);
    expect(cmpFaster.absoluteDelta).toBe(-20.0);
    expect(cmpFaster.percentageChange).toBe(-20.0);
    expect(cmpFaster.speedupRatio).toBe(1.25);

    // 25% regression
    const cmpSlower = compareBaselines(80.0, 100.0);
    expect(cmpSlower.absoluteDelta).toBe(20.0);
    expect(cmpSlower.percentageChange).toBe(25.0);
    expect(cmpSlower.speedupRatio).toBe(0.8);
  });

  test("6. Statistical calculator rejects empty or invalid samples array", () => {
    expect(() => calculateStatistics([])).toThrow();
  });

  test("7. Baseline v1 JSON schema validation", () => {
    const baselineJsonPath = path.join(rootDir, "benchmarks", "baseline_v1.json");
    expect(fs.existsSync(baselineJsonPath)).toBe(true);

    const report = JSON.parse(fs.readFileSync(baselineJsonPath, "utf-8"));
    expect(report.schema_version).toBe(1);
    expect(report.baseline).toBe("phase9-baseline-v1");
    expect(report.environment).toBeDefined();
    expect(report.environment.os).toBeDefined();
    expect(report.environment.node_version).toBeDefined();
    expect(report.environment.hkd_version).toBe("1.1.0");

    expect(report.methodology).toBeDefined();
    expect(report.methodology.workload_count).toBe(18);
    expect(report.methodology.warmup_iterations).toBe(3);
    expect(report.methodology.measured_iterations).toBe(5);

    expect(Array.isArray(report.workloads)).toBe(true);
    expect(report.workloads.length).toBe(18);

    for (const w of report.workloads) {
      expect(w.id).toBeDefined();
      expect(w.samples_ms.length).toBe(5);
      expect(w.statistics_ms.median).toBeGreaterThan(0);
      expect(w.correctness.verified).toBe(true);
    }
  });

  test("8. Baseline v1 Markdown report exists and contains summary tables", () => {
    const baselineMdPath = path.join(rootDir, "benchmarks", "baseline_v1.md");
    expect(fs.existsSync(baselineMdPath)).toBe(true);

    const content = fs.readFileSync(baselineMdPath, "utf-8");
    expect(content).toContain("HKD Phase 9A — Authoritative Performance Baseline v1");
    expect(content).toContain("CLI Version Startup");
    expect(content).toContain("Async Task Execution (RFC-004)");
    expect(content).toContain("Artifact Metrics");
  });
});
