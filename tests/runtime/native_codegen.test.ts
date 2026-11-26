import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

function zigPackageFor(platform: NodeJS.Platform, architecture: string): string {
  const os = platform === "win32" ? "win32" : (platform === "darwin" ? "darwin" : "linux");
  const arch = architecture === "arm64" ? "arm64" : "x64";
  return `${os}-${arch}`;
}

function getZigBinary(): string {
  try {
    const isWin = process.platform === "win32";
    const plat = zigPackageFor(process.platform, process.arch);
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

  const packageCases: Array<[NodeJS.Platform, string, string]> = [
    ["win32", "x64", "win32-x64"],
    ["win32", "arm64", "win32-arm64"],
    ["linux", "x64", "linux-x64"],
    ["linux", "arm64", "linux-arm64"],
    ["darwin", "x64", "darwin-x64"],
    ["darwin", "arm64", "darwin-arm64"],
  ];

  test.each(packageCases)("selects the Zig package for %s/%s", (platform, architecture, expected) => {
    expect(zigPackageFor(platform, architecture)).toBe(expected);
  });

  (isX64 ? test : test.skip)("Native x86_64 machine code compiles and executes in W^X memory", () => {
    // Run Zig unit test verifying real machine code execution in executable memory
    const res = spawnSync(zigBin, ["build", "test"], {
      cwd: runtimeDir,
      encoding: "utf-8",
    });
    if (res.error) throw res.error;
    expect(res.status).toBe(0);
  });

  test("Native runtime binary compiles with ReleaseFast", () => {
    const binPath = path.resolve(runtimeDir, "zig-out", "bin", process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime");
    if (process.env.HKD_PREBUILT_RUNTIME !== "true") {
      const res = spawnSync(zigBin, ["build", "-Doptimize=ReleaseFast"], {
        cwd: runtimeDir,
        encoding: "utf-8",
      });
      if (res.error) throw res.error;
      expect(res.status).toBe(0);
    }
    expect(fs.existsSync(binPath)).toBe(true);
    const version = spawnSync(binPath, ["--version"], { encoding: "utf-8" });
    expect(version.status).toBe(0);
    expect(`${version.stdout ?? ""}${version.stderr ?? ""}`).toContain("HKD 1.1.0");
  });

  test("native runtime rejects the currently unintegrated JIT mode clearly", () => {
    const binPath = path.resolve(runtimeDir, "zig-out", "bin", process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime");
    const bytecodePath = path.resolve(process.cwd(), "benchmarks", "phase9", "workloads", "minimal.hkdb");
    const res = spawnSync(binPath, ["--jit", bytecodePath], { encoding: "utf-8" });
    expect(res.error).toBeUndefined();
    expect(res.status).toBe(2);
    expect(`${res.stdout ?? ""}${res.stderr ?? ""}`).toContain("JIT execution is not implemented");
  });
});

