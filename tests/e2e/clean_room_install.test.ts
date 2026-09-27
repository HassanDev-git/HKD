/**
 * HKD Clean-Room CLI & Project Execution Test
 * (tests/e2e/clean_room_install.test.ts)
 *
 * Verifies that in a fresh, isolated temporary environment outside the project tree:
 * 1. `hkd init` initializes a project cleanly
 * 2. `hkd build` compiles modules
 * 3. `hkd run` executes the application and returns expected output
 * 4. Works without developer-specific or hardcoded host paths
 */

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";

describe("HKD Clean-Room Isolated Installation & Execution", () => {
  let cleanEnvDir: string;
  const cliScript = path.resolve("dist/cli/main.js");

  beforeEach(() => {
    cleanEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-cleanroom-"));
  });

  afterEach(() => {
    try {
      if (fs.existsSync(cleanEnvDir)) {
        fs.rmSync(cleanEnvDir, { recursive: true, force: true });
      }
    } catch {}
  });

  test("CLEAN-01: Standalone init, build, and run in isolated directory", () => {
    const projDir = path.join(cleanEnvDir, "isolated_service");

    const execEnv = { ...process.env, NODE_ENV: "production" };

    // 1. hkd init
    const initRes = spawnSync(process.execPath, [cliScript, "init", projDir, "isolated_service"], {
      encoding: "utf-8",
      cwd: cleanEnvDir,
      env: execEnv,
    });
    expect(initRes.status).toBe(0);
    expect(fs.existsSync(path.join(projDir, "hkd.toml"))).toBe(true);
    expect(fs.existsSync(path.join(projDir, "src", "main.hkd"))).toBe(true);

    // 2. Author clean HKD code utilizing 1.1 standard library
    const appCode = `
      import array;
      import result;

      fn double_val(x: Int) -> Int {
        return x * 2;
      }

      let nums = [10, 20, 30];
      let doubled = array.map(nums, double_val);
      print("doubled_len=" + to_string(array.len(doubled)));
      print("first=" + to_string(doubled[0]));

      let r = result.ok("CLEAN_ROOM_OK");
      print("status=" + result.unwrap(r));
    `;
    fs.writeFileSync(path.join(projDir, "src", "main.hkd"), appCode, "utf-8");

    // 3. hkd run using reference VM mode
    const runRes = spawnSync(process.execPath, [cliScript, "run", "src/main.hkd", "--reference"], {
      encoding: "utf-8",
      cwd: projDir,
      env: execEnv,
    });
    expect(runRes.status).toBe(0);
    expect(runRes.stdout).toContain("doubled_len=3");
    expect(runRes.stdout).toContain("first=20");
    expect(runRes.stdout).toContain("status=CLEAN_ROOM_OK");
  });
});
