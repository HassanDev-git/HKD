/**
 * HKD CLI API Stability & Exit Code Contract Suite
 *
 * Verifies standard CLI commands, flags, and contractual exit codes (0..5).
 */

import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "child_process";
import * as path from "path";

describe("HKD CLI Stability & Exit Codes Contract", () => {
  const cliScript = path.resolve("dist/cli/main.js");
  const execEnv = { ...process.env, NODE_ENV: "production" };

  test("--version flag returns HKD 1.1.0 with exit code 0", () => {
    const res = spawnSync(process.execPath, [cliScript, "--version"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("1.1.0");
  });

  test("--help flag lists canonical commands with exit code 0", () => {
    const res = spawnSync(process.execPath, [cliScript, "--help"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("build");
    expect(res.stdout).toContain("run");
    expect(res.stdout).toContain("test");
    expect(res.stdout).toContain("doctor");
  });

  test("unknown command exits with usage error code 2", () => {
    const res = spawnSync(process.execPath, [cliScript, "unknown-subcmd-xyz"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(2);
  });

  test("doctor command completes with exit code 0", () => {
    const res = spawnSync(process.execPath, [cliScript, "doctor"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/doctor/i);
  });
});
