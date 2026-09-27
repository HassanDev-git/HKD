"use strict";
/**
 * HKD Release Artifact & Integrity Engine
 *
 * Models release artifacts, computes cryptographic SHA-256 digests,
 * generates artifact.json manifests, and verifies artifact integrity.
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
exports.computeSha256 = computeSha256;
exports.generateArtifactMetadata = generateArtifactMetadata;
exports.writeArtifactMetadata = writeArtifactMetadata;
exports.generateSha256Sums = generateSha256Sums;
exports.verifyArtifact = verifyArtifact;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const index_js_1 = require("../utils/index.js");
function computeSha256(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}
function generateArtifactMetadata(binaryPath, pkgName, pkgVersion, target, profile) {
    const stat = fs.statSync(binaryPath);
    const checksum = computeSha256(binaryPath);
    return {
        name: pkgName,
        version: pkgVersion,
        target: target.triple,
        architecture: target.arch,
        os: target.os,
        compilerVersion: index_js_1.HKD_VERSION,
        runtimeVersion: index_js_1.HKD_VERSION,
        buildProfile: profile.name,
        checksum,
        sizeBytes: stat.size,
        buildTimestamp: new Date().toISOString(),
        binaryName: path.basename(binaryPath),
    };
}
function writeArtifactMetadata(outDir, meta) {
    fs.mkdirSync(outDir, { recursive: true });
    const metaPath = path.join(outDir, "artifact.json");
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
    return metaPath;
}
function generateSha256Sums(dir, fileNames) {
    const lines = [];
    for (const f of fileNames) {
        const full = path.join(dir, f);
        if (fs.existsSync(full)) {
            const hash = computeSha256(full);
            lines.push(`${hash}  ${f}`);
        }
    }
    const sumsPath = path.join(dir, "SHA256SUMS");
    fs.writeFileSync(sumsPath, lines.join("\n") + "\n", "utf-8");
    return sumsPath;
}
function verifyArtifact(targetPath) {
    const errors = [];
    if (!fs.existsSync(targetPath)) {
        return { valid: false, errors: [`File or directory not found: ${targetPath}`] };
    }
    const stat = fs.statSync(targetPath);
    // If path is a release directory containing artifact.json
    if (stat.isDirectory()) {
        const metaPath = path.join(targetPath, "artifact.json");
        if (!fs.existsSync(metaPath)) {
            return { valid: false, errors: [`artifact.json not found in release directory: ${targetPath}`] };
        }
        try {
            const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            const binPath = path.join(targetPath, meta.binaryName);
            if (!fs.existsSync(binPath)) {
                errors.push(`Referenced binary missing from artifact: ${meta.binaryName}`);
            }
            else {
                const actualSha = computeSha256(binPath);
                if (actualSha !== meta.checksum) {
                    errors.push(`Checksum mismatch for ${meta.binaryName}: expected ${meta.checksum}, got ${actualSha}`);
                }
            }
            // Check SHA256SUMS if present
            const sumsPath = path.join(targetPath, "SHA256SUMS");
            if (fs.existsSync(sumsPath)) {
                const lines = fs.readFileSync(sumsPath, "utf-8").split("\n").filter(Boolean);
                for (const l of lines) {
                    const [expectedHash, fName] = l.trim().split(/\s+/);
                    if (fName === "SHA256SUMS")
                        continue;
                    const fPath = path.join(targetPath, fName);
                    if (fs.existsSync(fPath)) {
                        const h = computeSha256(fPath);
                        if (h !== expectedHash) {
                            errors.push(`SHA256SUMS mismatch for ${fName}: expected ${expectedHash}, got ${h}`);
                        }
                    }
                }
            }
            return {
                valid: errors.length === 0,
                errors,
                metadata: meta,
            };
        }
        catch (err) {
            return { valid: false, errors: [`Malformed artifact.json: ${err.message}`] };
        }
    }
    // If path is a standalone binary
    const actualSha = computeSha256(targetPath);
    const data = fs.readFileSync(targetPath);
    if (data.length >= 16) {
        const magic = data.subarray(data.length - 8).toString("ascii");
        if (magic === "HKDSTAND") {
            const payloadLen = data.readBigUInt64LE(data.length - 16);
            if (data.length < Number(payloadLen) + 16) {
                errors.push("Corrupt HKDSTAND payload length trailer");
            }
        }
    }
    return {
        valid: errors.length === 0,
        errors,
        actualSha256: actualSha,
    };
}
//# sourceMappingURL=artifact.js.map