/**
 * HKD Production Runtime Observability & Exit Codes
 */

import { HKD_VERSION } from "../utils/index.js";

export enum ExitCode {
  Success = 0,
  RuntimeError = 1,
  UsageError = 2,
  ConfigError = 3,
  BuildError = 4,
  DeployError = 5,
}

export interface RuntimeInfoReport {
  version: string;
  target: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  uptimeSeconds: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
  };
  supportedTiers: string[];
  activeLimits: {
    maxConnections: number;
    maxRequestBodyMb: number;
  };
}

export function getRuntimeInfo(): RuntimeInfoReport {
  const mem = process.memoryUsage();
  return {
    version: HKD_VERSION,
    target: `${process.arch === "x64" ? "x86_64" : process.arch}-${process.platform === "win32" ? "windows" : process.platform}`,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: parseFloat((mem.rss / 1024 / 1024).toFixed(2)),
      heapUsedMb: parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2)),
      heapTotalMb: parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2)),
    },
    supportedTiers: [
      "Stack VM (Tier 0)",
      "Native Zig Baseline JIT (Tier 1)",
      "Native Optimizing JIT with PGO (Tier 2)",
      "Standalone Native AOT Executable",
    ],
    activeLimits: {
      maxConnections: 10000,
      maxRequestBodyMb: 10,
    },
  };
}

export function printRuntimeInfo(report: RuntimeInfoReport, asJson = false): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nHKD Production Runtime Environment v${report.version}\n`);
  console.log(`  Platform:         ${report.platform} (${report.arch})`);
  console.log(`  Target Triple:    ${report.target}`);
  console.log(`  Node Engine:      ${report.nodeVersion}`);
  console.log(`  Uptime:           ${report.uptimeSeconds}s`);
  console.log(`  Memory Usage:     RSS ${report.memory.rssMb} MB / Heap ${report.memory.heapUsedMb} MB`);
  console.log(`  Execution Tiers:`);
  for (const tier of report.supportedTiers) {
    console.log(`    - ${tier}`);
  }
  console.log("");
}
