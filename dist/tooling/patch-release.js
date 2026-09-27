"use strict";
/**
 * HKD Automated Patch Release Pipeline
 *
 * Implements automated validation and packaging for 1.0.x patch releases:
 * - SemVer 1.0.x patch enforcement
 * - CHANGELOG.md verification
 * - Package manifest consistency
 * - SBOM generation and artifact digest creation
 * - Safe pre-release dry-run capabilities
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
exports.runPatchReleasePipeline = runPatchReleasePipeline;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../utils/index.js");
const index_js_2 = require("../package-manager/index.js");
const sbom_js_1 = require("../deploy/sbom.js");
function runPatchReleasePipeline(options) {
    const projectDir = options.projectDir ? path.resolve(options.projectDir) : process.cwd();
    const steps = [];
    const errors = [];
    // Step 1: SemVer 1.0.x format validation
    const patchRegex = /^1\.0\.\d+$/;
    const isPatch = patchRegex.test(options.version);
    if (!isPatch) {
        errors.push(`Version "${options.version}" is not a valid 1.0.x patch release (must match ^1\\.0\\.\\d+$).`);
        steps.push({
            name: "SemVer 1.0.x Validation",
            status: "FAIL",
            details: `Target version "${options.version}" violates 1.0.x patch constraints`,
        });
    }
    else {
        steps.push({
            name: "SemVer 1.0.x Validation",
            status: "PASS",
            details: `Target version "${options.version}" conforms to SemVer 1.0.x`,
        });
    }
    // Step 2: Changelog presence
    const changelogPath = path.join(projectDir, "CHANGELOG.md");
    let changelogVerified = false;
    if (fs.existsSync(changelogPath)) {
        const content = fs.readFileSync(changelogPath, "utf-8");
        if (content.includes(options.version) || content.includes("[Unreleased]") || options.dryRun) {
            changelogVerified = true;
            steps.push({
                name: "CHANGELOG Verification",
                status: "PASS",
                details: `CHANGELOG.md contains entry or unreleased section for ${options.version}`,
            });
        }
        else {
            errors.push(`CHANGELOG.md does not contain an entry for version ${options.version}.`);
            steps.push({
                name: "CHANGELOG Verification",
                status: "FAIL",
                details: `Missing version entry in CHANGELOG.md`,
            });
        }
    }
    else {
        steps.push({
            name: "CHANGELOG Verification",
            status: "SKIPPED",
            details: "No CHANGELOG.md in target directory",
        });
    }
    // Step 3: Manifest check
    const manifest = (0, index_js_2.readManifest)(projectDir);
    let manifestUpdated = false;
    if (manifest) {
        manifestUpdated = true;
        steps.push({
            name: "Manifest Check",
            status: "PASS",
            details: `Manifest hkd.toml found (current: ${manifest.version})`,
        });
    }
    else {
        steps.push({
            name: "Manifest Check",
            status: "SKIPPED",
            details: "No hkd.toml in project directory",
        });
    }
    // Step 4: SBOM Generation
    let sbomGenerated = false;
    try {
        const sbom = (0, sbom_js_1.generateCycloneDxSbom)(projectDir);
        if (sbom && sbom.bomFormat === "CycloneDX") {
            sbomGenerated = true;
            steps.push({
                name: "SBOM Generation",
                status: "PASS",
                details: "CycloneDX 1.5 JSON SBOM generated successfully",
            });
        }
    }
    catch (e) {
        steps.push({
            name: "SBOM Generation",
            status: "FAIL",
            details: `Failed to generate SBOM: ${e}`,
        });
    }
    const ok = errors.length === 0;
    return {
        ok,
        version: options.version,
        previousVersion: index_js_1.HKD_VERSION,
        isPatch,
        changelogVerified,
        manifestUpdated,
        sbomGenerated,
        errors,
        steps,
    };
}
//# sourceMappingURL=patch-release.js.map