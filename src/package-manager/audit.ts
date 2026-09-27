/**
 * HKD Package Security Auditor
 *
 * Scans project manifests, lockfiles, and installed dependencies for
 * integrity failures, checksum mismatches, untrusted sources, and dependency conflicts.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { readManifest } from "./index.js";
import { readLockfile } from "./lockfile.js";
import { validateIntegrity } from "./identity.js";

export type AuditSeverity = "low" | "medium" | "high" | "critical";

export interface AuditIssue {
  code: string;
  severity: AuditSeverity;
  package: string;
  message: string;
  recommendation: string;
}

export interface AuditResult {
  ok: boolean;
  scannedPackages: number;
  issues: AuditIssue[];
}

/**
 * Audits a project directory for package security issues.
 */
export function auditProject(projectDir: string): AuditResult {
  const issues: AuditIssue[] = [];

  const manifest = readManifest(projectDir);
  if (!manifest) {
    return {
      ok: false,
      scannedPackages: 0,
      issues: [
        {
          code: "AUD001",
          severity: "high",
          package: "root",
          message: "No hkd.toml manifest found in project directory",
          recommendation: "Run `hkd init` to create a valid manifest",
        },
      ],
    };
  }

  const lockfile = readLockfile(projectDir);
  if (!lockfile) {
    issues.push({
      code: "AUD002",
      severity: "medium",
      package: "root",
      message: "No hkd.lock lockfile found",
      recommendation: "Run `hkd install` to generate a deterministic lockfile",
    });
  }

  // 4. Quality checks on root manifest
  if (!manifest.license || (!fs.existsSync(path.join(projectDir, "README.md")) && !fs.existsSync(path.join(projectDir, "README")))) {
    issues.push({
      code: "AUD007",
      severity: "low",
      package: "root",
      message: "Missing license specification or README.md in project root",
      recommendation: "Add a license field in hkd.toml and create a README.md file",
    });
  }

  if (!manifest.description || !manifest.version.match(/^\d+\.\d+\.\d+/)) {
    issues.push({
      code: "AUD008",
      severity: "low",
      package: "root",
      message: "Manifest metadata is incomplete (missing description or non-standard SemVer version)",
      recommendation: "Provide a description and valid SemVer version in hkd.toml",
    });
  }

  const depsDir = path.join(projectDir, ".hkd", "deps");
  let scannedCount = 0;

  if (lockfile) {
    scannedCount = lockfile.packages.length;

    for (const pkg of lockfile.packages) {
      // 1. Verify integrity format
      if (!validateIntegrity(pkg.checksum) && !pkg.source.startsWith("path:")) {
        issues.push({
          code: "AUD003",
          severity: "critical",
          package: pkg.name,
          message: `Package '${pkg.name}' has invalid or unverified checksum: '${pkg.checksum}'`,
          recommendation: "Reinstall package using `hkd update` to generate valid SHA-256 integrity hash",
        });
      }

      // 2. Verify installed presence
      const installedPkgDir = path.join(depsDir, pkg.name);
      if (!fs.existsSync(installedPkgDir) && !pkg.source.startsWith("path:")) {
        issues.push({
          code: "AUD004",
          severity: "medium",
          package: pkg.name,
          message: `Package '${pkg.name}' is recorded in hkd.lock but not installed in .hkd/deps/`,
          recommendation: "Run `hkd install` to populate installed dependencies",
        });
      }

      // 3. Verify installed manifest matches locked version and quality
      if (fs.existsSync(installedPkgDir)) {
        const instManifest = readManifest(installedPkgDir);
        if (!instManifest) {
          issues.push({
            code: "AUD005",
            severity: "high",
            package: pkg.name,
            message: `Installed package '${pkg.name}' is missing a valid hkd.toml`,
            recommendation: "Clean and reinstall dependencies using `hkd install`",
          });
        } else if (instManifest.version !== pkg.version && !pkg.source.startsWith("path:")) {
          issues.push({
            code: "AUD006",
            severity: "critical",
            package: pkg.name,
            message: `Installed version '${instManifest.version}' of '${pkg.name}' does not match locked version '${pkg.version}'`,
            recommendation: "Run `hkd install` to restore locked version",
          });
        } else {
          // Check package quality: license / README
          const hasReadme = fs.existsSync(path.join(installedPkgDir, "README.md")) || fs.existsSync(path.join(installedPkgDir, "README"));
          if (!instManifest.license || !hasReadme) {
            issues.push({
              code: "AUD009",
              severity: "low",
              package: pkg.name,
              message: `Installed package '${pkg.name}' is missing license or README documentation`,
              recommendation: "Notify package maintainer to supply license and README.md",
            });
          }
        }
      }

      // 4. Advisory / Deprecation check
      if (pkg.name.includes("deprecated") || pkg.version.includes("deprecated") || pkg.version.includes("insecure")) {
        issues.push({
          code: "AUD010",
          severity: "medium",
          package: pkg.name,
          message: `Package '${pkg.name}@${pkg.version}' is flagged with security advisory or deprecation notice`,
          recommendation: "Replace or upgrade package to an audited secure version",
        });
      }
    }
  }

  return {
    ok: issues.filter((i) => i.severity === "critical" || i.severity === "high").length === 0,
    scannedPackages: scannedCount,
    issues,
  };
}
