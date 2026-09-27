/**
 * HKD CLI UX & Diagnostics Test Suite
 * (tests/cli/cli_ux.test.ts)
 *
 * Implements Requirement 21:
 * - Valid flags (--version, --help) with exit code 0
 * - Invalid/unknown commands with exit code 2
 * - Missing required arguments with clear error messages
 * - Structured stderr/stdout behavior
 */

import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "child_process";
import * as path from "path";
import * as os from "os";

describe("HKD CLI 2.0 — UX, Error Codes & Diagnostics", () => {
  const cliScript = path.resolve("dist/cli/main.js");
  const execEnv = { ...process.env, NODE_ENV: "production" };

  test("CLI-UX-01: --version produces clean version output and exit code 0", () => {
    const res = spawnSync(process.execPath, [cliScript, "--version"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  test("CLI-UX-02: --help outputs usage description and command list", () => {
    const res = spawnSync(process.execPath, [cliScript, "--help"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("COMMANDS:");
    expect(res.stdout).toContain("init");
    expect(res.stdout).toContain("run");
    expect(res.stdout).toContain("build");
    expect(res.stdout).toContain("test");
    expect(res.stdout).toContain("doctor");
  });

  test("CLI-UX-03: Unknown command exits with non-zero code and helpful message", () => {
    const res = spawnSync(process.execPath, [cliScript, "nonexistent-subcommand-foo"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(2);
    expect(res.stderr + res.stdout).toMatch(/unknown command/i);
  });

  test("CLI-UX-04: hkd run without arguments reports missing target file", () => {
    const res = spawnSync(process.execPath, [cliScript, "run"], {
      cwd: os.tmpdir(),
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr + res.stdout).toMatch(/no file or project found|no file specified/i);
  });

  test("CLI-UX-05: hkd explain provides structured remediation hints", () => {
    const res = spawnSync(process.execPath, [cliScript, "explain", "E101"], {
      encoding: "utf-8",
      env: execEnv,
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain("E101");
  });
});
