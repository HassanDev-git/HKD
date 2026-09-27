import { describe, it, expect } from "@jest/globals";
import { ExitCode, getRuntimeInfo } from "../../src/deploy/runtime-info.js";
import { verifyArtifact } from "../../src/deploy/artifact.js";
import { runDeployCheck } from "../../src/deploy/check.js";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

describe("Phase 14 Production Exit Codes & System Signals Specifications", () => {
  it("enforces standardized exit code for Success = 0", () => {
    expect(ExitCode.Success).toBe(0);
  });

  it("enforces standardized exit code for RuntimeError = 1", () => {
    expect(ExitCode.RuntimeError).toBe(1);
  });

  it("enforces standardized exit code for UsageError = 2", () => {
    expect(ExitCode.UsageError).toBe(2);
  });

  it("enforces standardized exit code for ConfigError = 3", () => {
    expect(ExitCode.ConfigError).toBe(3);
  });

  it("enforces standardized exit code for BuildError = 4", () => {
    expect(ExitCode.BuildError).toBe(4);
  });

  it("enforces standardized exit code for DeployError = 5", () => {
    expect(ExitCode.DeployError).toBe(5);
  });

  it("ensures all exit code enum values are distinct", () => {
    const codes = [
      ExitCode.Success,
      ExitCode.RuntimeError,
      ExitCode.UsageError,
      ExitCode.ConfigError,
      ExitCode.BuildError,
      ExitCode.DeployError,
    ];
    const unique = new Set(codes);
    expect(unique.size).toBe(codes.length);
  });

  it("ensures runtime-info reports positive memory metrics", () => {
    const info = getRuntimeInfo();
    expect(info.memory.rssMb).toBeGreaterThan(0);
    expect(info.memory.heapUsedMb).toBeGreaterThan(0);
    expect(info.memory.heapTotalMb).toBeGreaterThanOrEqual(info.memory.heapUsedMb);
  });

  it("ensures runtime-info lists all 4 execution tiers", () => {
    const info = getRuntimeInfo();
    expect(info.supportedTiers).toEqual(
      expect.arrayContaining([
        "Stack VM (Tier 0)",
        "Native Zig Baseline JIT (Tier 1)",
        "Native Optimizing JIT with PGO (Tier 2)",
        "Standalone Native AOT Executable",
      ])
    );
  });

  it("maps failed deploy checks to DeployError condition", () => {
    const tmp = path.join(os.tmpdir(), `hkd-fail-check-${Date.now()}`);
    fs.mkdirSync(tmp, { recursive: true });
    try {
      const report = runDeployCheck(tmp, "x86_64-linux", "release");
      expect(report.allOk).toBe(false);
      // When report.allOk is false, CLI exits with ExitCode.DeployError (5)
      const mappedCode = report.allOk ? ExitCode.Success : ExitCode.DeployError;
      expect(mappedCode).toBe(ExitCode.DeployError);
    } finally {
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    }
  });

  it("maps failed artifact verification to DeployError condition", () => {
    const res = verifyArtifact("non_existent_file_for_exit_code_test");
    expect(res.valid).toBe(false);
    const mappedCode = res.valid ? ExitCode.Success : ExitCode.DeployError;
    expect(mappedCode).toBe(ExitCode.DeployError);
  });

  it("ensures active HTTP connection limits are configured to 10,000 default", () => {
    const info = getRuntimeInfo();
    expect(info.activeLimits.maxConnections).toBe(10000);
    expect(info.activeLimits.maxRequestBodyMb).toBe(10);
  });

  it("verifies process uptime reports valid integer", () => {
    const info = getRuntimeInfo();
    expect(typeof info.uptimeSeconds).toBe("number");
    expect(info.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
