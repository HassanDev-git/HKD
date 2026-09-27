import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

function getZigBinary(): string {
  const localZig = path.resolve(
    process.cwd(),
    "node_modules",
    "@zigc",
    process.platform === "win32" ? "win32-x64" : (process.platform === "darwin" ? "darwin-x64" : "linux-x64"),
    "bin",
    process.platform === "win32" ? "zig.exe" : "zig"
  );
  if (fs.existsSync(localZig)) return localZig;
  return "zig";
}

describe("HKD Phase 10G — Minimal Native Code Generator", () => {
  const runtimeDir = path.resolve(process.cwd(), "native-runtime");
  const zigBin = getZigBinary();

  test("Native x86_64 machine code compiles and executes in W^X memory", () => {
    // Run Zig unit test verifying real machine code execution in executable memory
    const res = spawnSync(zigBin, ["build", "test"], {
      cwd: runtimeDir,
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
  });

  test("Native runtime binary compiles with ReleaseFast", () => {
    const res = spawnSync(zigBin, ["build", "-Doptimize=ReleaseFast"], {
      cwd: runtimeDir,
      encoding: "utf-8",
    });
    expect(res.status).toBe(0);
    const binPath = path.resolve(runtimeDir, "zig-out", "bin", process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime");
    expect(fs.existsSync(binPath)).toBe(true);
  });
});

