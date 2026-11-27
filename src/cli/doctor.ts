/**
 * HKD Tooling Doctor 2.0 (hkd doctor)
 *
 * Diagnostics: compiler, optional native bytecode runtime, JIT/AOT status,
 * target architectures, LSP/DAP servers, package cache, containerization, and environment.
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { VM } from "../vm/vm.js";
import { Chunk } from "../bytecode/chunk.js";
import { Op } from "../bytecode/opcodes.js";
import { getHostTarget } from "../deploy/targets.js";
import { HKD_VERSION } from "../utils/index.js";

export interface DoctorCheck {
  name: string;
  category: "compiler" | "runtime" | "lsp" | "debugger" | "package" | "vscode" | "target" | "container" | "deploy" | "security";
  status: "ok" | "warn" | "error";
  message: string;
  details?: string;
}

export interface DoctorReport {
  version: string;
  platform: string;
  arch: string;
  allOk: boolean;
  checks: DoctorCheck[];
}

function isStandaloneExecutable(): boolean {
  try {
    const sea = require("node:sea") as { isSea?: () => boolean };
    return sea.isSea?.() === true;
  } catch {
    return false;
  }
}

function findFirstCandidate(candidates: string[]): string | null {
  for (const candidate of candidates) {
    const relativeToModule = path.resolve(__dirname, candidate);
    if (fs.existsSync(relativeToModule)) return relativeToModule;
    const relativeToWorkingDirectory = path.resolve(process.cwd(), candidate);
    if (fs.existsSync(relativeToWorkingDirectory)) return relativeToWorkingDirectory;
  }
  return null;
}

function checkServerModule(load: () => unknown, candidates: string[]): boolean {
  try {
    load();
    return true;
  } catch {
    // The standalone SEA embeds these modules instead of shipping their source files.
    return !isStandaloneExecutable() && findFirstCandidate(candidates) !== null;
  }
}

export function runDoctor(): DoctorReport {
  const checks: DoctorCheck[] = [];

  // 1. Compiler Check
  try {
    const chunk = new Chunk("<test>", 0);
    chunk.writeByte(Op.LoadTrue, 1);
    chunk.writeByte(Op.Return, 1);
    const vm = new VM(() => {});
    const res = vm.run(chunk);
    if (res.ok && res.value === true) {
      checks.push({
        name: "HKD Bytecode Compiler & Stack VM",
        category: "compiler",
        status: "ok",
        message: "Reference compiler and VM engine operating normally",
      });
    } else {
      checks.push({
        name: "HKD Bytecode Compiler & Stack VM",
        category: "compiler",
        status: "error",
        message: "VM test execution failed",
      });
    }
  } catch (err: any) {
    checks.push({
      name: "HKD Bytecode Compiler & Stack VM",
      category: "compiler",
      status: "error",
      message: err.message,
    });
  }

  // 2. Native Runtime Binary Check
  const isWindows = process.platform === "win32";
  const binName = isWindows ? "hkd-runtime.exe" : "hkd-runtime";
  const nativeBinaryPath = findFirstCandidate(isStandaloneExecutable()
    ? [`../bin/${binName}`, `bin/${binName}`, binName]
    : [
        `../../native-runtime/zig-out/bin/${binName}`,
        `../../../native-runtime/zig-out/bin/${binName}`,
        `../bin/${binName}`,
        binName,
        `native-runtime/zig-out/bin/${binName}`,
        `bin/${binName}`,
      ]);

  if (nativeBinaryPath && fs.existsSync(nativeBinaryPath)) {
    const testRun = spawnSync(nativeBinaryPath, ["--version"], { encoding: "utf-8" });
    const runtimeOutput = `${testRun.stdout ?? ""}${testRun.stderr ?? ""}`.trim();
    if (testRun.status === 0 && runtimeOutput) {
      checks.push({
        name: "Native Zig Bytecode Runtime",
        category: "runtime",
        status: "ok",
        message: `Optional native runtime executable verified (${runtimeOutput})`,
        details: nativeBinaryPath,
      });
    } else {
      checks.push({
        name: "Native Zig Bytecode Runtime",
        category: "runtime",
        status: "warn",
        message: "Optional native runtime was found but did not pass its startup check; the reference VM remains available.",
        details: testRun.error?.message || runtimeOutput || `exit status ${testRun.status}`,
      });
    }
  } else {
    checks.push({
      name: "Native Zig Bytecode Runtime",
      category: "runtime",
      status: "warn",
        message: "Optional native runtime is not installed; HKD remains usable with the bundled TypeScript reference VM.",
        details: "Build the native runtime only if you want to use it: npx zig build -Doptimize=ReleaseFast",
    });
  }

  // 3. Target Architecture & OS Check
  const hostTarget = getHostTarget();
  checks.push({
    name: "Host Target Architecture",
    category: "target",
    status: hostTarget.tier === "Tier 1 (Supported)" ? "ok" : "warn",
    message: `${hostTarget.triple} (${hostTarget.tier})`,
  });

  // 4. Language Server Check (LSP 2.0)
  const lspCandidates = [
    "../lsp/server.js", "../../dist/lsp/server.js", "dist/lsp/server.js",
  ];
  const lspAvailable = checkServerModule(
    () => require("../lsp/server.js"),
    lspCandidates,
  );
  if (lspAvailable) {
    checks.push({
      name: "HKD Language Server Protocol 2.0 (LSP)",
      category: "lsp",
      status: "ok",
      message: "LSP server module is available to the CLI",
    });
  } else {
    checks.push({
      name: "HKD Language Server Protocol 2.0 (LSP)",
      category: "lsp",
      status: "error",
      message: "LSP server module not found",
    });
  }

  // 5. Debug Adapter Protocol Check (DAP)
  const dapCandidates = [
    "../debug/server.js", "../../dist/debug/server.js", "dist/debug/server.js",
  ];
  const dapAvailable = checkServerModule(
    () => require("../debug/server.js"),
    dapCandidates,
  );
  if (dapAvailable) {
    checks.push({
      name: "HKD Debug Adapter Protocol (DAP)",
      category: "debugger",
      status: "ok",
      message: "DAP server module is available to the CLI",
    });
  } else {
    checks.push({
      name: "HKD Debug Adapter Protocol (DAP)",
      category: "debugger",
      status: "error",
      message: "DAP server module not found",
    });
  }

  // 6. Package Manager & Cache Check
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const cacheDir = path.join(homeDir, ".hkd", "cache");
  checks.push({
    name: "Package Manager & Cache Subsystem",
    category: "package",
    status: "ok",
    message: `Package manager available; cache is configured at ${cacheDir}`,
    details: fs.existsSync(cacheDir) ? "Cache directory exists; package availability and write access were not tested." : "Cache directory has not been created yet; it will be created when needed.",
  });

  // 7. Containerization & Docker Toolchain
  checks.push({
    name: "Container & Multi-Stage Deployment",
    category: "container",
    status: "warn",
    message: "Container configuration support is available; image build and runtime were not tested by Doctor.",
    details: "Run the documented container build and runtime checks to verify image behavior and non-root execution.",
  });

  // 8. VS Code Extension Check
  const vsCodePkg = isStandaloneExecutable() ? null : findFirstCandidate([
    "../../vscode-extension/package.json",
    "../../../vscode-extension/package.json",
    "vscode-extension/package.json",
  ]);
  let vsCodeManifest: { main?: string } | null = null;
  if (vsCodePkg) {
    try {
      vsCodeManifest = JSON.parse(fs.readFileSync(vsCodePkg, "utf-8")) as { main?: string };
    } catch {
      vsCodeManifest = null;
    }
  }
  const vsCodeEntry = vsCodePkg && vsCodeManifest?.main
    ? path.resolve(path.dirname(vsCodePkg), vsCodeManifest.main)
    : null;
  if (vsCodeEntry && fs.existsSync(vsCodeEntry)) {
    checks.push({
      name: "VS Code Extension Manifest",
      category: "vscode",
      status: "ok",
      message: "VS Code extension manifest and compiled entry point are available",
      details: vsCodeEntry,
    });
  } else {
    checks.push({
      name: "VS Code Extension Manifest",
      category: "vscode",
      status: "warn",
      message: vsCodePkg
        ? "VS Code extension source is present but its compiled entry point is missing."
        : "VS Code extension is distributed separately and is not installed with this HKD package.",
      details: vsCodePkg ?? "Install the HKD extension separately from the VS Code Marketplace or a verified VSIX.",
    });
  }

  // 9. Security, Fuzzing & Audit Subsystem
  const hasFuzz = findFirstCandidate([
    "../../fuzz/regressions",
    "../../fuzz/corpus",
    "fuzz/regressions",
    "fuzz/corpus",
  ]) !== null;
  checks.push({
    name: "Security, Fuzzing & Audit Engine",
    category: "security",
    status: "ok",
    message: "Security audit commands are available; no security scan was run by Doctor.",
    details: hasFuzz ? "A fuzz regression corpus is present; it was not executed by Doctor." : "No fuzz regression corpus was found in this installation.",
  });

  const allOk = checks.every((c) => c.status !== "error");

  return {
    version: HKD_VERSION,
    platform: process.platform,
    arch: process.arch,
    allOk,
    checks,
  };
}

export function printDoctorReport(report: DoctorReport, asJson = false): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nHKD Doctor v${report.version} — System & Environment Health\n`);
  console.log(`  Platform: ${report.platform} (${report.arch})\n`);

  console.log("  ┌───┬──────────────────────────────────────────┬────────────┬────────┐");
  console.log("  │ # │ Subsystem                                │ Category   │ Status │");
  console.log("  ├───┼──────────────────────────────────────────┼────────────┼────────┤");
  report.checks.forEach((c, idx) => {
    const num = String(idx + 1).padEnd(1);
    const name = c.name.padEnd(40).slice(0, 40);
    const cat = c.category.padEnd(10).slice(0, 10);
    const stat = c.status === "ok" ? "\x1b[32mOK    \x1b[0m" : c.status === "warn" ? "\x1b[33mWARN  \x1b[0m" : "\x1b[31mFAIL  \x1b[0m";
    console.log(`  │ ${num} │ ${name} │ ${cat} │ ${stat} │`);
  });
  console.log("  └───┴──────────────────────────────────────────┴────────────┴────────┘\n");

  for (const check of report.checks) {
    let icon = "✓";
    let color = "\x1b[32m";
    if (check.status === "warn") {
      icon = "⚠";
      color = "\x1b[33m";
    } else if (check.status === "error") {
      icon = "✗";
      color = "\x1b[31m";
    }
    console.log(`  ${color}${icon}\x1b[0m ${check.name}: ${check.message}`);
    if (check.details) {
      console.log(`    \x1b[2m${check.details}\x1b[0m`);
    }
  }

  console.log("");
  if (report.allOk) {
    const warnings = report.checks.filter((check) => check.status === "warn").length;
    if (warnings > 0) {
      console.log(`Core HKD checks passed. Review the ${warnings} optional warning(s) above.\n`);
    } else {
      console.log("All checked systems are operational.\n");
    }
  } else {
    console.log("Some checks failed. Please address the errors above.\n");
  }
}
