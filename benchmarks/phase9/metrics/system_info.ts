/**
 * HKD Phase 9 Environment Metadata Extractor
 *
 * Gathers sanitized, normalized hardware, runtime, and toolchain metadata
 * without exposing sensitive user environment variables or personal paths.
 */

import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

export interface EnvironmentMetadata {
  os: string;
  architecture: string;
  cpuModel: string;
  cpuLogicalCores: number;
  totalMemoryBytes: number;
  totalMemoryMb: number;
  nodeVersion: string;
  typescriptVersion: string;
  hkdVersion: string;
  git: {
    commit: string;
    branch: string;
    dirty: boolean;
  };
  buildMode: string;
  runnerVersion: string;
  timestamp: string;
}

/**
 * Extracts and sanitizes the system environment metadata for benchmarking.
 */
export function getSystemMetadata(rootDir: string = process.cwd()): EnvironmentMetadata {
  const cpus = os.cpus();
  const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : "Unknown CPU";
  const cpuCount = cpus ? cpus.length : 1;
  const totalMem = os.totalmem();

  // Read HKD package.json version
  let hkdVer = "1.1.0";
  try {
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      hkdVer = pkg.version || hkdVer;
    }
  } catch {}

  // Read TypeScript version from package.json devDependencies
  let tsVer = "5.5.2";
  try {
    const pkgPath = path.join(rootDir, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      tsVer = pkg.devDependencies?.typescript?.replace(/[\^~]/g, "") || tsVer;
    }
  } catch {}

  // Git state inspection
  let gitCommit = "unknown";
  let gitBranch = "unknown";
  let isDirty = false;

  try {
    const rev = spawnSync("git", ["rev-parse", "HEAD"], { cwd: rootDir, encoding: "utf-8" });
    if (rev.status === 0 && rev.stdout) {
      gitCommit = rev.stdout.trim();
    }
    const br = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: rootDir, encoding: "utf-8" });
    if (br.status === 0 && br.stdout) {
      gitBranch = br.stdout.trim();
    }
    const st = spawnSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf-8" });
    if (st.status === 0) {
      isDirty = st.stdout.trim().length > 0;
    }
  } catch {}

  return {
    os: os.platform(),
    architecture: os.arch(),
    cpuModel,
    cpuLogicalCores: cpuCount,
    totalMemoryBytes: totalMem,
    totalMemoryMb: Math.round(totalMem / (1024 * 1024)),
    nodeVersion: process.version,
    typescriptVersion: tsVer,
    hkdVersion: hkdVer,
    git: {
      commit: gitCommit,
      branch: gitBranch,
      dirty: isDirty,
    },
    buildMode: process.env.NODE_ENV || "production",
    runnerVersion: "phase9-runner-1.0.0",
    timestamp: new Date().toISOString(),
  };
}
