/**
 * Regression Test: Fresh Project Init -> Test Workflow
 *
 * Verifies that running `hkd init` produces a project that immediately passes
 * `hkd test` out of the box across all templates (cli, lib, server) without
 * manual intervention or syntax errors.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";

describe("Developer Experience: Fresh hkd init -> hkd test Workflow", () => {
  let tmpRoot: string;
  const cliPath = path.resolve(__dirname, "../../dist/cli/main.js");
  const standaloneExe = path.resolve(__dirname, "../../dist/releases/windows-x64/hkd.exe");

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-init-test-"));
  });

  afterEach(() => {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test("CLI template: fresh hkd init -> hkd test succeeds with 0 errors", () => {
    const projDir = path.join(tmpRoot, "cli-app");
    const initRes = spawnSync(
      process.execPath,
      [cliPath, "init", projDir, "cli-app", "--template", "cli"],
      { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(initRes.status).toBe(0);
    expect(initRes.stdout).toContain("Created project");

    // Immediately test the newly initialized project
    const testRes = spawnSync(
      process.execPath,
      [cliPath, "test"],
      { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(testRes.status).toBe(0);
    expect(testRes.stdout).toContain("1 passed");
    expect(testRes.stdout).not.toContain("failed");
  });

  test("Library template: fresh hkd init -> hkd test succeeds and calls exported functions", () => {
    const projDir = path.join(tmpRoot, "lib-app");
    const initRes = spawnSync(
      process.execPath,
      [cliPath, "init", projDir, "lib-app", "--template", "lib"],
      { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(initRes.status).toBe(0);

    const testRes = spawnSync(
      process.execPath,
      [cliPath, "test"],
      { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(testRes.status).toBe(0);
    expect(testRes.stdout).toContain("addition works");
    expect(testRes.stdout).toContain("1 passed");
  });

  test("Server template: fresh hkd init -> hkd test succeeds out of the box", () => {
    const projDir = path.join(tmpRoot, "server-app");
    const initRes = spawnSync(
      process.execPath,
      [cliPath, "init", projDir, "server-app", "--template", "server"],
      { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(initRes.status).toBe(0);

    const testRes = spawnSync(
      process.execPath,
      [cliPath, "test"],
      { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
    );
    expect(testRes.status).toBe(0);
    expect(testRes.stdout).toContain("1 passed");
  });

  if (process.platform === "win32" && fs.existsSync(standaloneExe)) {
    test("Standalone binary: fresh hkd.exe init -> hkd.exe test works end-to-end", () => {
      const projDir = path.join(tmpRoot, "binary-app");
      const initRes = spawnSync(
        standaloneExe,
        ["init", projDir, "binary-app"],
        { cwd: tmpRoot, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(initRes.status).toBe(0);

      const testRes = spawnSync(
        standaloneExe,
        ["test"],
        { cwd: projDir, encoding: "utf-8", env: { ...process.env, NODE_ENV: "production" } }
      );
      expect(testRes.status).toBe(0);
      expect(testRes.stdout).toContain("1 passed");
    });
  }
});
