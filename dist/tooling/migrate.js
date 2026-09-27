"use strict";
/**
 * HKD 1.0 Project Migration Engine
 *
 * Upgrades pre-1.0 project manifests and lockfiles to Edition 2026 standards,
 * backing up existing files and verifying consistency.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigration = runMigration;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const lockfile_js_1 = require("../package-manager/lockfile.js");
function runMigration(projectDir, dryRun = false, targetEdition = "2026") {
    const changes = [];
    const warnings = [];
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
        }
        else {
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
                const v2 = (0, lockfile_js_1.migrateLockfileV1)(lockContent);
                const serialized = (0, lockfile_js_1.serializeLockfileV2)(v2);
                changes.push("Migrated legacy hkd.lock to Lockfile V2 (Edition 2026)");
                if (!dryRun) {
                    fs.copyFileSync(lockPath, `${lockPath}.bak`);
                    fs.writeFileSync(lockPath, serialized, "utf-8");
                    changes.push(`Created backup: ${lockPath}.bak`);
                }
            }
            catch (err) {
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
//# sourceMappingURL=migrate.js.map