/**
 * HKD Security Red-Team & Adversarial Penetration Test Suite
 *
 * Verifies:
 * 1. Secret redaction and credential masking across diagnostics and configs
 * 2. Archive path traversal attack defense (SEC005)
 * 3. Decompression bomb & oversized path protection (SEC003, SEC004)
 * 4. Call-stack overflow & memory safety bounds
 * 5. Bytecode verification boundaries
 */

import { describe, test, expect } from "@jest/globals";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { isSensitiveKey, maskValue, formatConfigReport } from "../../src/deploy/env-config.js";
import { unpackArchive, ARCHIVE_MAGIC } from "../../src/package-manager/archive.js";
import { runSource } from "../../src/runtime/index.js";

describe("HKD Security Red-Team Pass & Defensive Auditing", () => {
  describe("Secret Masking & Redaction Engine", () => {
    test("accurately identifies sensitive configuration keys", () => {
      const sensitiveKeys = [
        "API_KEY",
        "DATABASE_PASSWORD",
        "AUTH_TOKEN",
        "JWT_SECRET",
        "AWS_SECRET_ACCESS_KEY",
        "PRIVATE_KEY",
        "GITHUB_TOKEN",
        "CREDENTIALS_FILE",
        "PASSWD",
      ];
      for (const k of sensitiveKeys) {
        expect(isSensitiveKey(k)).toBe(true);
      }

      const publicKeys = [
        "PORT",
        "HOST",
        "LOG_LEVEL",
        "ENV",
        "MAX_CONNECTIONS",
        "TARGET",
        "PROFILE",
      ];
      for (const k of publicKeys) {
        expect(isSensitiveKey(k)).toBe(false);
      }
    });

    test("masks secrets with asterisks while keeping non-secrets intact", () => {
      expect(maskValue("DATABASE_PASSWORD", "SuperSecret123!")).toBe("********");
      expect(maskValue("API_TOKEN", "sk_test_51Mz000000000000")).toBe("********");
      expect(maskValue("PORT", 8080)).toBe("8080");
      expect(maskValue("HOST", "0.0.0.0")).toBe("0.0.0.0");
      expect(maskValue("KEY", null)).toBe("<unset>");
    });

    test("formatConfigReport masks all sensitive variables in tabular report", () => {
      const cfg = {
        host: "127.0.0.1",
        port: 8080,
        api_token: "secret_token_12345",
        db_password: "super_secret_pw",
        logLevel: "info",
      };
      const report = formatConfigReport(cfg);
      expect(report).toContain("127.0.0.1");
      expect(report).toContain("8080");
      expect(report).toContain("********");
      expect(report).not.toContain("secret_token_12345");
      expect(report).not.toContain("super_secret_pw");
    });
  });

  describe("Archive Path Traversal & Decompression Bomb Protection", () => {
    function buildSyntheticArchive(fileEntries: Array<{ path: string; data: Buffer }>): Buffer {
      const magicBuf = Buffer.from(ARCHIVE_MAGIC, "ascii");
      const manifestStr = JSON.stringify({ name: "synthetic", version: "1.0.0" });
      const manifestBuf = Buffer.from(manifestStr, "utf-8");
      const manifestLenBuf = Buffer.alloc(4);
      manifestLenBuf.writeUInt32BE(manifestBuf.length, 0);

      const fileCountBuf = Buffer.alloc(4);
      fileCountBuf.writeUInt32BE(fileEntries.length, 0);

      const chunks: Buffer[] = [magicBuf, manifestLenBuf, manifestBuf, fileCountBuf];

      for (const entry of fileEntries) {
        const pathBuf = Buffer.from(entry.path, "utf-8");
        const pathLenBuf = Buffer.alloc(4);
        pathLenBuf.writeUInt32BE(pathBuf.length, 0);

        const dataLenBuf = Buffer.alloc(4);
        dataLenBuf.writeUInt32BE(entry.data.length, 0);

        chunks.push(pathLenBuf, pathBuf, dataLenBuf, entry.data);
      }

      return Buffer.concat(chunks);
    }

    test("attack: rejects path traversal escaping project directory (../ traversal)", () => {
      const maliciousBuf = buildSyntheticArchive([
        { path: "../../evil.txt", data: Buffer.from("malicious payload") },
      ]);
      const outDir = path.join(os.tmpdir(), "hkd-sec-traversal-" + Date.now());
      expect(() => {
        unpackArchive(maliciousBuf, outDir);
      }).toThrow(/Path traversal attempt detected/);
    });

    test("attack: rejects absolute path traversal attempts", () => {
      const maliciousBuf = buildSyntheticArchive([
        { path: "/etc/passwd", data: Buffer.from("fake root file") },
      ]);
      const outDir = path.join(os.tmpdir(), "hkd-sec-abs-" + Date.now());
      expect(() => {
        unpackArchive(maliciousBuf, outDir);
      }).toThrow(/Path traversal attempt detected/);
    });

    test("attack: rejects oversized path length exceeding maximum", () => {
      const longPath = "a/".repeat(300) + "file.txt";
      const maliciousBuf = buildSyntheticArchive([
        { path: longPath, data: Buffer.from("overflow path") },
      ]);
      const outDir = path.join(os.tmpdir(), "hkd-sec-pathlen-" + Date.now());
      expect(() => {
        unpackArchive(maliciousBuf, outDir);
      }).toThrow(/File path length/);
    });

    test("attack: rejects archive declaring file count exceeding bomb limit", () => {
      const magicBuf = Buffer.from(ARCHIVE_MAGIC, "ascii");
      const manifestStr = JSON.stringify({ name: "bomb", version: "1.0.0" });
      const manifestBuf = Buffer.from(manifestStr, "utf-8");
      const manifestLenBuf = Buffer.alloc(4);
      manifestLenBuf.writeUInt32BE(manifestBuf.length, 0);

      const fileCountBuf = Buffer.alloc(4);
      fileCountBuf.writeUInt32BE(999999, 0); // 999k files exceeds MAX_ARCHIVE_FILES

      const bombBuf = Buffer.concat([magicBuf, manifestLenBuf, manifestBuf, fileCountBuf]);
      const outDir = path.join(os.tmpdir(), "hkd-sec-bomb-" + Date.now());
      expect(() => {
        unpackArchive(bombBuf, outDir);
      }).toThrow(/Archive bomb detected/);
    });
  });

  describe("Runtime Safety & Execution Boundaries", () => {
    test("handles deep recursion safely without unhandled crash", () => {
      const recursiveHkd = `
        fn recurse(n) {
            let x = recurse(n + 1);
            return x + 1;
        }
        recurse(0);
      `;
      const res = runSource(recursiveHkd, { printDiagnostics: false });
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/Stack overflow/);
    });
  });

});
