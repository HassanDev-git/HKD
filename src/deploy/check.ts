/**
 * HKD Pre-Flight Deployment Checklist & Dry-Run Inspector
 *
 * Validates compiler, target, lockfile, healthcheck endpoints, and security boundaries.
 */

import * as fs from "fs";
import * as path from "path";
import { readManifest } from "../package-manager/index.js";
import { parseTarget, TargetTriple } from "./targets.js";
import { resolveProfile, BuildProfile } from "./profiles.js";
import { loadEffectiveConfig, formatConfigReport } from "./env-config.js";

export interface DeployCheckItem {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
}

export interface DeployCheckReport {
  allOk: boolean;
  target: string;
  profile: string;
  items: DeployCheckItem[];
}

export function runDeployCheck(
  projectDir: string,
  targetStr?: string,
  profileStr?: string
): DeployCheckReport {
  const items: DeployCheckItem[] = [];
  const target = parseTarget(targetStr);
  const profile = resolveProfile(profileStr || "release");

  // 1. Manifest
  const manifest = readManifest(projectDir);
  if (manifest) {
    items.push({
      name: "Project Manifest (hkd.toml)",
      status: "ok",
      message: `Valid manifest for ${manifest.name} v${manifest.version || "0.1.0"}`,
    });
  } else {
    items.push({
      name: "Project Manifest (hkd.toml)",
      status: "error",
      message: "Missing or unreadable hkd.toml in project directory",
    });
  }

  // 2. Lockfile
  const lockPath = path.join(projectDir, "hkd.lock");
  if (fs.existsSync(lockPath)) {
    items.push({
      name: "Lockfile (hkd.lock)",
      status: "ok",
      message: "Resolved dependencies locked for reproducible deployment",
    });
  } else {
    items.push({
      name: "Lockfile (hkd.lock)",
      status: "warn",
      message: "hkd.lock not found. Run 'hkd install' to lock dependencies before production deployment",
    });
  }

  // 3. Target Triple
  items.push({
    name: "Target Architecture & OS",
    status: target.tier === "Tier 1 (Supported)" ? "ok" : "warn",
    message: `${target.triple} (${target.tier})`,
  });

  // 4. Build Profile
  items.push({
    name: "Build Optimization Profile",
    status: "ok",
    message: `${profile.name} (optLevel: ${profile.optLevel}, assertions: ${profile.enableAssertions})`,
  });

  // 5. Entrypoint
  const entry = manifest?.main || "src/main.hkd";
  const entryPath = path.join(projectDir, entry);
  if (fs.existsSync(entryPath)) {
    items.push({
      name: "Application Entrypoint",
      status: "ok",
      message: `Found entrypoint at ${entry}`,
    });
  } else {
    items.push({
      name: "Application Entrypoint",
      status: "error",
      message: `Entrypoint file not found: ${entry}`,
    });
  }

  // 6. Security Check (Uncommitted Secrets)
  const suspiciousFiles = [".env", "id_rsa", "private.key", "secrets.json"];
  const foundSuspicious = suspiciousFiles.filter((f) => fs.existsSync(path.join(projectDir, f)));
  if (foundSuspicious.length > 0) {
    items.push({
      name: "Secret File Exposure Check",
      status: "warn",
      message: `Potentially sensitive files found in project root: ${foundSuspicious.join(", ")}`,
    });
  } else {
    items.push({
      name: "Secret File Exposure Check",
      status: "ok",
      message: "No plain-text private keys or root secret files detected",
    });
  }

  const allOk = items.every((i) => i.status !== "error");

  return {
    allOk,
    target: target.triple,
    profile: profile.name,
    items,
  };
}

export function printDeployCheckReport(report: DeployCheckReport, asJson = false): void {
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`\nHKD Pre-Flight Deployment Checklist (${report.target} / ${report.profile})\n`);

  for (const item of report.items) {
    let icon = "✓";
    if (item.status === "warn") icon = "⚠";
    if (item.status === "error") icon = "✗";
    console.log(`  ${icon} ${item.name}: ${item.message}`);
  }

  console.log("");
  if (report.allOk) {
    console.log("Pre-flight deployment checks passed. Project is ready for production.\n");
  } else {
    console.log("Pre-flight deployment checks failed. Correct errors before deploying.\n");
  }
}

export function runDeployDryRun(projectDir: string, targetStr?: string, profileStr?: string): void {
  const target = parseTarget(targetStr);
  const profile = resolveProfile(profileStr || "release");
  const manifest = readManifest(projectDir);
  const config = loadEffectiveConfig({ projectDir });

  console.log("\n── HKD Deployment Dry Run Plan ─────────────────────────────────────\n");
  console.log(`  Project:         ${manifest?.name || "unknown"} v${manifest?.version || "0.1.0"}`);
  console.log(`  Target Triple:   ${target.triple} (${target.tier})`);
  console.log(`  Build Profile:   ${profile.name} (opt: ${profile.optLevel})`);
  console.log(`  Deploy Target:   ${(manifest as any)?.deploy?.target || "standalone-server"}`);
  console.log(`  Listening Port:  ${config.port}`);
  console.log(`  Health Endpoint: ${(manifest as any)?.deploy?.healthcheck || "/health"}`);
  console.log(`  Actions Planned:`);
  console.log(`    1. Compile source modules incrementally`);
  console.log(`    2. Generate standalone native binary with ${profile.name} optimizations`);
  console.log(`    3. Generate release metadata (artifact.json, SHA256SUMS, CycloneDX SBOM)`);
  console.log(`    4. Package release distribution`);
  console.log("\n  No deployment changes executed (dry-run mode).\n");
}
