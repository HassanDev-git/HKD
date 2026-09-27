/**
 * HKD Release Artifact Integrity & Attack Resistance Test Suite
 *
 * Simulates adversarial supply chain attacks:
 * 1. Tampered executable payload byte modification
 * 2. Forged hashes in SHA256SUMS
 * 3. Deleted or corrupted artifact.json metadata
 * 4. Missing binary target
 * 5. CLI rejection verification with canonical exit code 5 (DeployError)
 */

import { describe, test, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { spawnSync } from "child_process";
import { verifyArtifact } from "../../src/deploy/artifact.js";
import { ExitCode } from "../../src/deploy/runtime-info.js";

describe("HKD Artifact Verification & Tamper Resistance Attack Suite", () => {
  let tmpDir: string;
  const originalBinName = "app.exe";
  let validSha: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-attack-test-"));
    const binPath = path.join(tmpDir, originalBinName);
    const binData = Buffer.from("HKD_BINARY_PAYLOAD_VALID_0123456789ABCDEF");
    fs.writeFileSync(binPath, binData);

    const crypto = require("crypto");
    validSha = crypto.createHash("sha256").update(binData).digest("hex");

    // Valid artifact.json
    const meta = {
      name: "test-app",
      version: "1.0.0",
      target: "x86_64-windows",
      architecture: "x86_64",
      os: "windows",
      compilerVersion: "1.0.0",
      runtimeVersion: "1.0.0",
      buildProfile: "release",
      checksum: validSha,
      sizeBytes: binData.length,
      buildTimestamp: new Date().toISOString(),
      binaryName: originalBinName,
    };
    fs.writeFileSync(path.join(tmpDir, "artifact.json"), JSON.stringify(meta, null, 2), "utf-8");

    // Valid SHA256SUMS
    fs.writeFileSync(
      path.join(tmpDir, "SHA256SUMS"),
      `${validSha}  ${originalBinName}\n`,
      "utf-8"
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  test("baseline valid artifact passes verification", () => {
    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(true);
    expect(res.errors.length).toBe(0);
  });

  test("attack: modified binary payload is detected and rejected", () => {
    const binPath = path.join(tmpDir, originalBinName);
    // Tamper binary payload by appending one byte
    fs.appendFileSync(binPath, Buffer.from([0xff]));

    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Checksum mismatch"))).toBe(true);
  });

  test("attack: tampered hash in SHA256SUMS is detected and rejected", () => {
    // Modify SHA256SUMS to have mismatched hash
    const fakeSha = "0".repeat(64);
    fs.writeFileSync(
      path.join(tmpDir, "SHA256SUMS"),
      `${fakeSha}  ${originalBinName}\n`,
      "utf-8"
    );

    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("SHA256SUMS mismatch"))).toBe(true);
  });

  test("attack: missing artifact.json fails verification", () => {
    fs.unlinkSync(path.join(tmpDir, "artifact.json"));
    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("artifact.json not found"))).toBe(true);
  });

  test("attack: malformed JSON in artifact.json fails verification", () => {
    fs.writeFileSync(path.join(tmpDir, "artifact.json"), "{ invalid_json: ...", "utf-8");
    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Malformed artifact.json"))).toBe(true);
  });

  test("attack: missing referenced binary fails verification", () => {
    fs.unlinkSync(path.join(tmpDir, originalBinName));
    const res = verifyArtifact(tmpDir);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.includes("Referenced binary missing"))).toBe(true);
  });

  test("CLI verify-artifact strictly terminates with exit code 5 (DeployError) upon tampering", () => {
    // Tamper binary
    const binPath = path.join(tmpDir, originalBinName);
    fs.appendFileSync(binPath, Buffer.from("CORRUPT"));

    const cliPath = path.resolve("dist/cli/main.js");
    const res = spawnSync(process.execPath, [cliPath, "verify-artifact", tmpDir], {
      encoding: "utf-8",
      env: { ...process.env, NODE_ENV: "production" },
    });

    expect(res.status).toBe(ExitCode.DeployError);
    expect(res.stderr).toContain("Artifact verification failed");
  });

});
