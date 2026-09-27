import { describe, test, expect } from "@jest/globals";
import {
  validatePackageName,
  normalizePackageName,
  formatPackageId,
  validateIntegrity,
} from "../../src/package-manager/identity.js";

describe("HKD Phase 12B — Package Identity & Validation", () => {
  test("Valid canonical package names are accepted", () => {
    const valid = ["http", "json", "router", "database", "crypto", "cli", "my-pkg", "pkg_123", "a1-b2_c3"];
    for (const name of valid) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(true);
      expect(normalizePackageName(name)).toBe(name);
    }
  });

  test("Rejects path traversal attempts", () => {
    const malicious = ["../evil", "..\\evil", "foo/bar", "foo\\bar", "..", "foo/../bar"];
    for (const name of malicious) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
      expect(() => normalizePackageName(name)).toThrow();
    }
  });

  test("Rejects reserved package names", () => {
    const reserved = ["hkd", "std", "core", "builtin", "main", "nul", "con", "prn", "aux", "com1", "lpt1"];
    for (const name of reserved) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("reserved");
    }
  });

  test("Rejects uppercase letters, spaces, and control characters", () => {
    const invalid = ["HTTP", "my package", "pkg\x00evil", "pkg\n", "pkg\tname"];
    for (const name of invalid) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
    }
  });

  test("Rejects visual spoofing with consecutive special characters", () => {
    const spoofing = ["my--pkg", "pkg__test", "pkg-_name", "pkg_-name"];
    for (const name of spoofing) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("consecutive");
    }
  });

  test("Rejects leading or trailing hyphens and underscores", () => {
    const edgeCases = ["-pkg", "pkg-", "_pkg", "pkg_"];
    for (const name of edgeCases) {
      const res = validatePackageName(name);
      expect(res.valid).toBe(false);
    }
  });

  test("Rejects names longer than 64 characters", () => {
    const longName = "a".repeat(65);
    const res = validatePackageName(longName);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("64");
  });

  test("formatPackageId produces canonical format", () => {
    expect(formatPackageId("http", "1.2.0")).toBe("http@1.2.0");
    expect(formatPackageId("my-router", "0.4.1-beta")).toBe("my-router@0.4.1-beta");
  });

  test("validateIntegrity verifies SHA-256 digests", () => {
    expect(validateIntegrity("sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
    expect(validateIntegrity("md5:1234")).toBe(false);
    expect(validateIntegrity("sha256:short")).toBe(false);
    expect(validateIntegrity("not-a-hash")).toBe(false);
  });
});
