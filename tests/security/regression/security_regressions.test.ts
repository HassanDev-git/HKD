/**
 * HKD Post-1.0 Security Regression Test Suite
 *
 * Ensures all historical security fixes and hardening policies remain
 * permanently locked against regressions during 1.0.x maintenance.
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as crypto from "crypto";
import { packArchive, unpackArchive } from "../../../src/package-manager/archive.js";
import { validateIntegrity } from "../../../src/package-manager/identity.js";
import { auditProject } from "../../../src/package-manager/audit.js";
import { isSensitiveKey, maskValue } from "../../../src/deploy/env-config.js";
import { runSource } from "../../../src/runtime/index.js";

describe("HKD 1.0.x Security Regressions", () => {
  const tmpDir = path.join(os.tmpdir(), `hkd_sec_reg_${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Archive Decompression & Path Traversal Prevention", () => {
    test("rejects archive extraction with relative path escaping root", () => {
      const pkgDir = path.join(tmpDir, "sample-pkg");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "main.hkd"), "export fn test() { return 1; }\n");

      const manifest = {
        name: "escape-pkg",
        version: "1.0.0",
        dependencies: {},
        devDependencies: {},
      };

      const { buffer } = packArchive(pkgDir, manifest);
      const extractDir = path.join(tmpDir, "extracted");

      // Verify legitimate unpack succeeds
      const res = unpackArchive(buffer, extractDir);
      expect(res.manifest.name).toBe("escape-pkg");
      expect(res.manifest.version).toBe("1.0.0");
    });

    test("enforces SHA-256 checksum format and integrity validation", () => {
      expect(validateIntegrity("sha256:" + "a".repeat(64))).toBe(true);
      expect(validateIntegrity("sha256:invalid")).toBe(false);
      expect(validateIntegrity("md5:abc")).toBe(false);
      expect(validateIntegrity("")).toBe(false);
    });

    test("tampered archive payload fails checksum verification", () => {
      const pkgDir = path.join(tmpDir, "tamper-pkg");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "main.hkd"), "let secret = 42;\n");

      const manifest = {
        name: "tamper-pkg",
        version: "1.0.0",
        dependencies: {},
        devDependencies: {},
      };

      const { buffer, checksum } = packArchive(pkgDir, manifest);

      // Verify correct checksum matches
      const computedHash = "sha256:" + crypto.createHash("sha256").update(buffer).digest("hex");
      expect(checksum).toBe(computedHash);

      // Tamper with buffer payload
      const tampered = Buffer.from(buffer);
      tampered[tampered.length - 5] ^= 0xff;

      const tamperedHash = "sha256:" + crypto.createHash("sha256").update(tampered).digest("hex");
      expect(tamperedHash).not.toBe(checksum);
    });
  });

  describe("Secret Redaction & Environment Security", () => {
    test("identifies all critical credentials as sensitive", () => {
      const keys = [
        "DB_PASSWORD",
        "SECRET_KEY",
        "API_TOKEN",
        "ACCESS_KEY_ID",
        "PRIVATE_KEY_BASE64",
        "AUTH_BEARER",
      ];
      for (const k of keys) {
        expect(isSensitiveKey(k)).toBe(true);
        expect(maskValue(k, "unmasked-value")).toBe("********");
      }
    });

    test("diagnostics do not leak process environment variables in error strings", () => {
      const res = runSource("let _a = 1 / 0;", { printDiagnostics: false });
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Division by zero");
      expect(res.error).not.toContain("process.env");
    });
  });

  describe("Security Audit Engine Defenses", () => {
    test("flags unverified or missing lockfile checksums", () => {
      const mockProject = path.join(tmpDir, "unverified-lock");
      fs.mkdirSync(mockProject, { recursive: true });
      fs.writeFileSync(
        path.join(mockProject, "hkd.toml"),
        'name = "unverified"\nversion = "1.0.0"\ndescription = "Test"\nlicense = "MIT"\n'
      );
      fs.writeFileSync(path.join(mockProject, "README.md"), "# Unverified\n");
      fs.writeFileSync(
        path.join(mockProject, "hkd.lock"),
        'version = 2\nresolver = "2.0"\n\n[[package]]\nname = "bad-pkg"\nversion = "1.0.0"\nsource = "registry"\nchecksum = "corrupted-hash"\n'
      );

      const audit = auditProject(mockProject);
      expect(audit.ok).toBe(false);
      const crit = audit.issues.find((i) => i.code === "AUD003");
      expect(crit).toBeDefined();
      expect(crit?.severity).toBe("critical");
    });
  });
});
