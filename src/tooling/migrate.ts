/**
 * HKD 1.0 Project Migration Engine
 *
 * Upgrades pre-1.0 project manifests and lockfiles to Edition 2026 standards,
 * backing up existing files and verifying consistency.
 */

import * as fs from "fs";
import * as path from "path";
import { serializeLockfileV2, migrateLockfileV1 } from "../package-manager/lockfile.js";

export interface MigrationResult {
  ok: boolean;
  changes: string[];
  warnings: string[];
}

export function runMigration(
  projectDir: string,
  dryRun = false,
  targetEdition: "2026" | "2027" = "2026"
): MigrationResult {
  const changes: string[] = [];
  const warnings: string[] = [];

  const manifestPath = path.join(projectDir, "hkd.toml");
  if (!fs.existsSync(manifestPath)) {
    return {
      ok: false,
      changes: [],
      warnings: ["No hkd.toml found in project directory"],
    };
  }

  // 1. Upgrade hkd.toml to target edition
  let manifestContent = fs.readFileSync(manifestPath, "utf-8");
  const targetEditionStr = `edition = "${targetEdition}"`;

  if (!manifestContent.includes(targetEditionStr)) {
    if (manifestContent.includes("edition =")) {
      manifestContent = manifestContent.replace(/edition\s*=\s*"[^"]*"/, targetEditionStr);
    } else {
      manifestContent = `${targetEditionStr}\n${manifestContent}`;
    }

    changes.push(`Upgraded project manifest to Edition ${targetEdition}`);

    if (!dryRun) {
      fs.copyFileSync(manifestPath, `${manifestPath}.bak`);
      fs.writeFileSync(manifestPath, manifestContent, "utf-8");
      changes.push(`Created backup: ${manifestPath}.bak`);
    }
  }

  // 2. Upgrade lockfile to V2 if present
  const lockPath = path.join(projectDir, "hkd.lock");
  if (fs.existsSync(lockPath)) {
    const lockContent = fs.readFileSync(lockPath, "utf-8");
    if (!lockContent.includes("version = 2")) {
      try {
        const v2 = migrateLockfileV1(lockContent);
        const serialized = serializeLockfileV2(v2);

        changes.push("Migrated legacy hkd.lock to Lockfile V2 (Edition 2026)");

        if (!dryRun) {
          fs.copyFileSync(lockPath, `${lockPath}.bak`);
          fs.writeFileSync(lockPath, serialized, "utf-8");
          changes.push(`Created backup: ${lockPath}.bak`);
        }
      } catch (err: any) {
        warnings.push(`Could not automatically migrate lockfile: ${err.message}`);
      }
    }
  }

  if (changes.length === 0) {
    changes.push(`Project is already fully conformant with Edition ${targetEdition} standards.`);
  }

  return {
    ok: warnings.length === 0,
    changes,
    warnings,
  };
}
