/**
 * HKD Reproducible Builds Diagnostic
 *
 * Implements clean dual-build verification to mathematically prove artifact
 * bit-for-bit equivalence and detect nondeterministic build sources.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { spawnSync } from "child_process";

export interface ReproducibilityResult {
  reproducible: boolean;
  hashA: string;
  hashB: string;
  fileSizeBytes: number;
  message: string;
}

/**
 * Builds the target file twice into isolated temporary outputs and compares SHA-256 hashes.
 */
export function verifyBuildReproducibility(
  sourceFile: string,
  cliPath: string
): ReproducibilityResult {
  const tempDir = path.resolve(".hkd/repro_test_" + Date.now());
  fs.mkdirSync(tempDir, { recursive: true });

  const dirA = path.join(tempDir, "run_a");
  const dirB = path.join(tempDir, "run_b");
  fs.mkdirSync(dirA, { recursive: true });
  fs.mkdirSync(dirB, { recursive: true });

  const fileA = path.join(dirA, "target.hkd");
  const fileB = path.join(dirB, "target.hkd");
  fs.copyFileSync(sourceFile, fileA);
  fs.copyFileSync(sourceFile, fileB);

  const outA = path.join(dirA, "target.hkdb");
  const outB = path.join(dirB, "target.hkdb");

  try {
    // Build A
    const resA = spawnSync(process.execPath, [cliPath, "build", fileA], {
      encoding: "utf-8",
      env: { ...process.env, NODE_ENV: "cli" },
    });
    if (resA.status !== 0) {
      throw new Error(`Build A failed: ${resA.stderr || resA.stdout}`);
    }

    // Build B
    const resB = spawnSync(process.execPath, [cliPath, "build", fileB], {
      encoding: "utf-8",
      env: { ...process.env, NODE_ENV: "cli" },
    });
    if (resB.status !== 0) {
      throw new Error(`Build B failed: ${resB.stderr || resB.stdout}`);
    }

    if (!fs.existsSync(outA) || !fs.existsSync(outB)) {
      throw new Error(`One or both build output files were not generated. outA=${outA} (exists: ${fs.existsSync(outA)}), outB=${outB} (exists: ${fs.existsSync(outB)}). resA=[${resA.stdout} | ${resA.stderr}], resB=[${resB.stdout} | ${resB.stderr}]`);
    }

    const bufA = fs.readFileSync(outA);
    const bufB = fs.readFileSync(outB);

    const hashA = crypto.createHash("sha256").update(bufA).digest("hex");
    const hashB = crypto.createHash("sha256").update(bufB).digest("hex");

    const match = hashA === hashB;

    return {
      reproducible: match,
      hashA: `sha256:${hashA}`,
      hashB: `sha256:${hashB}`,
      fileSizeBytes: bufA.length,
      message: match
        ? `✓ Verified 100% bit-for-bit reproducible build (${bufA.length} bytes, ${hashA.slice(0, 16)}...)`
        : `error[REP001]: Non-reproducible build detected: SHA-256 mismatch between independent runs`,
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
