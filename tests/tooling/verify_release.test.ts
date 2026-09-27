/**
 * HKD Automated Release Acceptance Verifier Tests (tests/tooling/verify_release.test.ts)
 *
 * Validates the acceptance gate suite used by `hkd verify-release`.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runVerifyRelease, printVerifyReleaseReport } from "../../src/tooling/verify-release.js";

describe("HKD Automated Release Acceptance Verifier (hkd verify-release)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-verify-rel-"));
    // Create minimal hkd.toml so deployment check passes
    fs.writeFileSync(
      path.join(tmpDir, "hkd.toml"),
      `[package]\nname = "verify-test"\nversion = "1.0.0"\nedition = "2026"\n`,
      "utf-8"
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("runs all 6 standard acceptance gates", () => {
    const report = runVerifyRelease(tmpDir);
    expect(report).toBeDefined();
    expect(report.version).toBe("1.1.0");
    expect(report.gates.length).toBeGreaterThanOrEqual(6);

    const gateNames = report.gates.map((g) => g.name);
    expect(gateNames).toContain("Compiler & VM Execution");
    expect(gateNames).toContain("Target Architecture Matrix");
    expect(gateNames).toContain("Deployment Pre-Flight Checks");
    expect(gateNames).toContain("Supply-Chain Security (SBOM)");
    expect(gateNames).toContain("Container Security Invariants");
    expect(gateNames).toContain("Exit Code Standard Contract");
  });

  test("compiler and VM execution gate passes", () => {
    const report = runVerifyRelease(tmpDir);
    const vmGate = report.gates.find((g) => g.name === "Compiler & VM Execution");
    expect(vmGate).toBeDefined();
    expect(vmGate?.status).toBe("PASS");
  });

  test("target architecture matrix gate passes on host system", () => {
    const report = runVerifyRelease(tmpDir);
    const targetGate = report.gates.find((g) => g.name === "Target Architecture Matrix");
    expect(targetGate).toBeDefined();
    expect(targetGate?.status).toBe("PASS");
  });

  test("canonical exit codes gate passes", () => {
    const report = runVerifyRelease(tmpDir);
    const exitGate = report.gates.find((g) => g.name === "Exit Code Standard Contract");
    expect(exitGate).toBeDefined();
    expect(exitGate?.status).toBe("PASS");
  });

  test("printVerifyReleaseReport outputs text and json formats", () => {
    const report = runVerifyRelease(tmpDir);
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...args: any[]) => logs.push(args.join(" "));

    try {
      printVerifyReleaseReport(report, false);
      expect(logs.some((l) => l.includes("HKD Release Verification"))).toBe(true);

      logs.length = 0;
      printVerifyReleaseReport(report, true);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.version).toBe("1.1.0");
      expect(parsed.gates).toBeDefined();
      expect(parsed.dimensions).toBeDefined();
    } finally {
      console.log = origLog;
    }
  });

  test("evaluates full 14-dimension production readiness status model", () => {
    const report = runVerifyRelease(process.cwd());
    expect(report.totalDimensions).toBe(14);
    expect(report.passedDimensions).toBe(14);
    expect(report.warningsCount).toBe(0);
    expect(report.blockersCount).toBe(0);
    expect(report.allPassed).toBe(true);

    const expectedDimensions = [
      "Correctness",
      "Security",
      "Memory",
      "Resources",
      "Compatibility",
      "Packages",
      "LSP",
      "DAP",
      "VS Code",
      "Deployment",
      "Containers",
      "Reproducibility",
      "Performance",
      "Documentation",
    ];

    for (const expected of expectedDimensions) {
      const dim = report.dimensions.find((d) => d.dimension === expected);
      expect(dim).toBeDefined();
      expect(dim?.status).toBe("PASS");
      expect(dim?.category).toBeTruthy();
      expect(dim?.message).toBeTruthy();
    }
  });

  test("falls back to reference production project when root lacks hkd.toml", () => {
    // When run on current repo root, it succeeds with 0 blocking issues and 0 warnings
    const report = runVerifyRelease(process.cwd());
    expect(report.allPassed).toBe(true);
    expect(report.blockersCount).toBe(0);
    const deployDim = report.dimensions.find((d) => d.dimension === "Deployment");
    expect(deployDim?.status).toBe("PASS");
  });
});

