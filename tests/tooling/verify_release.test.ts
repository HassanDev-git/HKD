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
    expect(gateNames).toContain("Container Template Invariants");
    expect(gateNames).toContain("Exit Code Standard Contract");
  });

  test("compiler and VM execution gate passes", () => {
    const report = runVerifyRelease(tmpDir);
    const vmGate = report.gates.find((g) => g.name === "Compiler & VM Execution");
    expect(vmGate).toBeDefined();
    expect(vmGate?.status).toBe("PASS");
  });

  test("target architecture matrix reports an untested runtime accurately", () => {
    const report = runVerifyRelease(tmpDir);
    const targetGate = report.gates.find((g) => g.name === "Target Architecture Matrix");
    expect(targetGate).toBeDefined();
    expect(targetGate?.status).toBe("WARN");
  });

  test("canonical exit codes gate reports its limited coverage", () => {
    const report = runVerifyRelease(tmpDir);
    const exitGate = report.gates.find((g) => g.name === "Exit Code Standard Contract");
    expect(exitGate).toBeDefined();
    expect(exitGate?.status).toBe("WARN");
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

  test("reports production readiness from executed evidence", () => {
    const report = runVerifyRelease(process.cwd());
    expect(report.totalDimensions).toBe(14);
    expect(report.passedDimensions).toBe(report.dimensions.filter((d) => d.status === "PASS").length);
    expect(report.warningsCount).toBeGreaterThan(0);
    if (report.blockersCount !== 0) {
      throw new Error(`Expected no release blockers, found: ${JSON.stringify(report.verificationGates.filter((g) => g.blocksRelease))}`);
    }
    expect(report.allPassed).toBe(true);
    expect(report.result).toBe("HOST TARGET READY");
    expect(report.releaseScope).toContain("Current host target only");
    expect(report.verificationGates.find((g) => g.name === "Native Machine-Code AOT")?.status).toBe("NOT IMPLEMENTED");
    expect(report.verificationGates.find((g) => g.name === "Native Machine-Code AOT")?.blocksRelease).toBe(false);
    expect(report.verificationGates.find((g) => g.name === "Standalone Native Bundle")?.status).toBe("PASS");
    expect(report.verificationGates.find((g) => g.name === "Resource Lifecycle")?.status).toBe("PASS");
    expect(report.verificationGates.find((g) => g.name === "Performance Benchmarks")?.status).toBe("PASS");

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
      expect(dim?.category).toBeTruthy();
      expect(dim?.message).toBeTruthy();
    }
    expect(report.dimensions.find((d) => d.dimension === "Performance")?.status).toBe("PASS");
  });

  test("falls back to reference production project when root lacks hkd.toml", () => {
    // Root-source deployment configuration is located in a production example.
    const report = runVerifyRelease(process.cwd());
    const deployDim = report.dimensions.find((d) => d.dimension === "Deployment");
    expect(deployDim?.status).toBe("PASS");
  });
});

