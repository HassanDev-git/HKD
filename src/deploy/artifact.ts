/**
 * HKD Release Artifact & Integrity Engine
 *
 * Models release artifacts, computes cryptographic SHA-256 digests,
 * generates artifact.json manifests, and verifies artifact integrity.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { TargetTriple } from "./targets.js";
import { BuildProfile } from "./profiles.js";
import { HKD_VERSION } from "../utils/index.js";

export interface ReleaseArtifactMetadata {
  name: string;
  version: string;
  target: string;
  architecture: string;
  os: string;
  compilerVersion: string;
  runtimeVersion: string;
  buildProfile: string;
  checksum: string;
  sizeBytes: number;
  buildTimestamp: string;
  binaryName: string;
  files?: Record<string, string>; // relativePath -> sha256
}

export function computeSha256(filePath: string): string {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function generateArtifactMetadata(
  binaryPath: string,
  pkgName: string,
  pkgVersion: string,
  target: TargetTriple,
  profile: BuildProfile
): ReleaseArtifactMetadata {
  const stat = fs.statSync(binaryPath);
  const checksum = computeSha256(binaryPath);

  return {
    name: pkgName,
    version: pkgVersion,
    target: target.triple,
    architecture: target.arch,
    os: target.os,
    compilerVersion: HKD_VERSION,
    runtimeVersion: HKD_VERSION,
    buildProfile: profile.name,
    checksum,
    sizeBytes: stat.size,
    buildTimestamp: new Date().toISOString(),
    binaryName: path.basename(binaryPath),
  };
}

export function writeArtifactMetadata(outDir: string, meta: ReleaseArtifactMetadata): string {
  fs.mkdirSync(outDir, { recursive: true });
  const metaPath = path.join(outDir, "artifact.json");
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  return metaPath;
}

export function generateSha256Sums(dir: string, fileNames: string[]): string {
  const lines: string[] = [];
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

export interface VerificationResult {
  valid: boolean;
  errors: string[];
  metadata?: ReleaseArtifactMetadata;
  actualSha256?: string;
}

export function verifyArtifact(targetPath: string): VerificationResult {
  const errors: string[] = [];

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
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as ReleaseArtifactMetadata;
      const binPath = path.join(targetPath, meta.binaryName);
      if (!fs.existsSync(binPath)) {
        errors.push(`Referenced binary missing from artifact: ${meta.binaryName}`);
      } else {
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
          if (fName === "SHA256SUMS") continue;
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
    } catch (err: any) {
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
