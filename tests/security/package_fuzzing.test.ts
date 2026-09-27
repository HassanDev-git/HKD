import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { unpackArchive, ARCHIVE_MAGIC } from "../../src/package-manager/archive.js";
import { validatePackageName } from "../../src/package-manager/identity.js";
import { parseVersion, parseRange } from "../../src/package-manager/semver.js";
import { assertSafePath } from "../../src/package-manager/security.js";

describe("HKD Phase 12AA — Security & Robustness Fuzzing", () => {
  const tempDir = path.resolve(".hkd/test_fuzz");

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("Package Name Sanitization Fuzzing", () => {
    const maliciousNames = [
      "",
      "   ",
      "\t\n",
      "../evil",
      "..\\evil",
      "evil/sub",
      "evil\\sub",
      "/absolute",
      "C:\\Windows",
      "con",
      "prn",
      "aux",
      "nul",
      "com1",
      "lpt1",
      "my--pkg",
      "my__pkg",
      "my-_pkg",
      "-mypkg",
      "_mypkg",
      "mypkg-",
      "mypkg_",
      "UpperCase",
      "pkg with spaces",
      "pkg$dollar",
      "pkg#hash",
      "pkg!bang",
      "a".repeat(129), // Too long
    ];

    test.each(maliciousNames)("Rejects malicious package name: '%s'", (name) => {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe("Path Traversal & Escape Fuzzing", () => {
    const maliciousPaths = [
      "../etc/passwd",
      "..\\Windows\\System32",
      "/var/log/syslog",
      "\\evil\\share",
      "a/../../b",
      "subdir/../../../escape",
      "C:\\boot.ini",
    ];

    test.each(maliciousPaths)("Rejects unsafe path: '%s'", (relPath) => {
      expect(() => assertSafePath(tempDir, relPath)).toThrow(/error\[SEC005\]/);
    });
  });

  describe("Malformed Archive Bomb & Truncation Fuzzing", () => {
    test("Rejects empty buffer", () => {
      expect(() => unpackArchive(Buffer.alloc(0), tempDir)).toThrow(/error\[SEC002\]/);
    });

    test("Rejects truncated header", () => {
      expect(() => unpackArchive(Buffer.from("HKD"), tempDir)).toThrow(/error\[SEC002\]/);
    });

    test("Rejects archive declaring excessive file count (archive bomb)", () => {
      const buf = Buffer.alloc(32);
      buf.write(ARCHIVE_MAGIC, 0, "ascii");
      // manifest len: 2 bytes
      buf.writeUInt32BE(2, 9);
      buf.write("{}", 13, "utf-8");
      // file count: 999999 (exceeds MAX_ARCHIVE_FILES = 5000)
      buf.writeUInt32BE(999999, 15);

      expect(() => unpackArchive(buf, tempDir)).toThrow(/error\[SEC003\]/);
    });

    test("Rejects archive declaring excessive path length", () => {
      const buf = Buffer.alloc(64);
      buf.write(ARCHIVE_MAGIC, 0, "ascii");
      buf.writeUInt32BE(2, 9);
      buf.write("{}", 13, "utf-8");
      // file count: 1
      buf.writeUInt32BE(1, 15);
      // path len: 500 (exceeds MAX_PATH_LENGTH = 260)
      buf.writeUInt32BE(500, 19);

      expect(() => unpackArchive(buf, tempDir)).toThrow(/error\[SEC004\]/);
    });
  });

  describe("SemVer Engine Robustness Fuzzing", () => {
    const invalidVersions = [
      "",
      "1",
      "1.2",
      "1.2.3.4",
      "v1.0.0",
      "1.0.0-",
      "1.0.0+",
      "1.01.0", // Leading zero
      "01.1.0",
      "1.1.01",
      "a.b.c",
      "1.2.3-01",
      "NaN.NaN.NaN",
    ];

    test.each(invalidVersions)("Rejects invalid SemVer string: '%s'", (ver) => {
      expect(() => parseVersion(ver)).toThrow();
    });

    test("Parses complex wildcard and disjunctive range specifications without crashing", () => {
      expect(() => parseRange(">=1.0.0 <2.0.0 || >=3.0.0")).not.toThrow();
      expect(() => parseRange("^1.2.3-alpha.1")).not.toThrow();
      expect(() => parseRange("~0.2.3")).not.toThrow();
      expect(() => parseRange("*")).not.toThrow();
      expect(() => parseRange("1.x")).not.toThrow();
    });
  });
});
