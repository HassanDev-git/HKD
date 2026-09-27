"use strict";
/**
 * HKD Release & Distribution Orchestrator
 *
 * Coordinates compilation, testing, metadata generation, checksumming,
 * SBOM generation, and release bundle packaging.
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
exports.buildReleaseBundle = buildReleaseBundle;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../package-manager/index.js");
const targets_js_1 = require("./targets.js");
const profiles_js_1 = require("./profiles.js");
const artifact_js_1 = require("./artifact.js");
const sbom_js_1 = require("./sbom.js");
function buildReleaseBundle(compiledBinaryPath, options) {
    const projectDir = options.projectDir;
    const manifest = (0, index_js_1.readManifest)(projectDir);
    if (!manifest) {
        return { ok: false, message: "Missing hkd.toml manifest" };
    }
    const target = (0, targets_js_1.parseTarget)(options.target);
    const profile = (0, profiles_js_1.resolveProfile)(options.profile || "release");
    const baseOutDir = options.outDir || path.join(projectDir, "target", "releases");
    const releaseName = `${manifest.name}-${manifest.version || "0.1.0"}-${target.triple}-${profile.name}`;
    const bundleDir = path.join(baseOutDir, releaseName);
    fs.mkdirSync(bundleDir, { recursive: true });
    // 1. Copy binary
    const binaryFileName = `${manifest.name}${target.executableExtension}`;
    const destBinPath = path.join(bundleDir, binaryFileName);
    fs.copyFileSync(compiledBinaryPath, destBinPath);
    // 2. Write metadata (artifact.json)
    const meta = (0, artifact_js_1.generateArtifactMetadata)(destBinPath, manifest.name, manifest.version || "0.1.0", target, profile);
    (0, artifact_js_1.writeArtifactMetadata)(bundleDir, meta);
    // 3. Write SBOM (sbom.json)
    (0, sbom_js_1.writeSbomJson)(projectDir, path.join(bundleDir, "sbom.json"));
    // 4. Copy README & LICENSE if present
    for (const doc of ["README.md", "LICENSE", "LICENSE.txt", "hkd.toml"]) {
        const srcDoc = path.join(projectDir, doc);
        if (fs.existsSync(srcDoc)) {
            fs.copyFileSync(srcDoc, path.join(bundleDir, doc));
        }
    }
    // 5. Generate SHA256SUMS
    const filesInBundle = fs.readdirSync(bundleDir).filter((f) => f !== "SHA256SUMS");
    (0, artifact_js_1.generateSha256Sums)(bundleDir, filesInBundle);
    // 6. Verify bundle
    const verifyRes = (0, artifact_js_1.verifyArtifact)(bundleDir);
    if (!verifyRes.valid) {
        return {
            ok: false,
            message: `Artifact verification failed: ${verifyRes.errors.join("; ")}`,
            bundleDir,
        };
    }
    return {
        ok: true,
        message: `Release bundle created and verified successfully: ${bundleDir}`,
        bundleDir,
        metadata: meta,
    };
}
//# sourceMappingURL=release.js.map