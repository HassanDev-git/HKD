/**
 * HKD Release & Distribution Orchestrator
 *
 * Coordinates compilation, testing, metadata generation, checksumming,
 * SBOM generation, and release bundle packaging.
 */

import * as fs from "fs";
import * as path from "path";
import * as zlib from "zlib";
import { readManifest } from "../package-manager/index.js";
import { parseTarget, getHostTarget, TargetTriple } from "./targets.js";
import { resolveProfile, BuildProfile } from "./profiles.js";
import {
  generateArtifactMetadata,
  writeArtifactMetadata,
  generateSha256Sums,
  verifyArtifact,
  ReleaseArtifactMetadata,
} from "./artifact.js";
import { writeSbomJson } from "./sbom.js";
import { runDeployCheck } from "./check.js";

export interface ReleaseOptions {
  projectDir: string;
  target?: string;
  profile?: string;
  outDir?: string;
  skipTests?: boolean;
}

export interface ReleaseResult {
  ok: boolean;
  message: string;
  bundleDir?: string;
  archivePath?: string;
  metadata?: ReleaseArtifactMetadata;
}

export function buildReleaseBundle(
  compiledBinaryPath: string,
  options: ReleaseOptions
): ReleaseResult {
  const projectDir = options.projectDir;
  const manifest = readManifest(projectDir);
  if (!manifest) {
    return { ok: false, message: "Missing hkd.toml manifest" };
  }

  const target = parseTarget(options.target);
  const profile = resolveProfile(options.profile || "release");

  const baseOutDir = options.outDir || path.join(projectDir, "target", "releases");
  const releaseName = `${manifest.name}-${manifest.version || "0.1.0"}-${target.triple}-${profile.name}`;
  const bundleDir = path.join(baseOutDir, releaseName);

  fs.mkdirSync(bundleDir, { recursive: true });

  // 1. Copy binary
  const binaryFileName = `${manifest.name}${target.executableExtension}`;
  const destBinPath = path.join(bundleDir, binaryFileName);
  fs.copyFileSync(compiledBinaryPath, destBinPath);

  // 2. Write metadata (artifact.json)
  const meta = generateArtifactMetadata(
    destBinPath,
    manifest.name,
    manifest.version || "0.1.0",
    target,
    profile
  );
  writeArtifactMetadata(bundleDir, meta);

  // 3. Write SBOM (sbom.json)
  writeSbomJson(projectDir, path.join(bundleDir, "sbom.json"));

  // 4. Copy README & LICENSE if present
  for (const doc of ["README.md", "LICENSE", "LICENSE.txt", "hkd.toml"]) {
    const srcDoc = path.join(projectDir, doc);
    if (fs.existsSync(srcDoc)) {
      fs.copyFileSync(srcDoc, path.join(bundleDir, doc));
    }
  }

  // 5. Generate SHA256SUMS
  const filesInBundle = fs.readdirSync(bundleDir).filter((f) => f !== "SHA256SUMS");
  generateSha256Sums(bundleDir, filesInBundle);

  // 6. Verify bundle
  const verifyRes = verifyArtifact(bundleDir);
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
