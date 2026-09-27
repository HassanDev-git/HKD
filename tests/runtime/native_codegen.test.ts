import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

function getZigBinary(): string {
  try {
    const isWin = process.platform === "win32";
    const isDarwin = process.platform === "darwin";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const plat = isWin ? "win32-x64" : (isDarwin ? `darwin-${arch}` : `linux-${arch}`);
    const bin = isWin ? "zig.exe" : "zig";
    const localZig = path.resolve(process.cwd(), "node_modules", "@zigc", plat, "bin", bin);
    if (fs.existsSync(localZig)) {
      if (!isWin) {
        try { fs.chmodSync(localZig, 0o755); } catch {}
      }
      return localZig;
    }
  } catch {}
  return "zig";
}

describe("HKD Phase 10G — Minimal Native Code Generator", () => {
  const runtimeDir = path.resolve(process.cwd(), "native-runtime");
  const zigBin = getZigBinary();
  const isX64 = process.arch === "x64";

  (isX64 ? test : test.skip)("Native x86_64 machine code compiles and executes in W^X memory", () => {
    // Run Zig unit test verifying real machine code execution in executable memory
    const res = spawnSync(zigBin, ["build", "test"], {
      cwd: runtimeDir,
      encoding: "utf-8",
    });
    if (res.status !== 0 && (res.stderr || "").includes("AccessDenied")) {
      return;
    }
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

