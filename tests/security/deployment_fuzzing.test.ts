import { describe, it, expect } from "@jest/globals";
import { parseTarget } from "../../src/deploy/targets.js";
import { resolveProfile } from "../../src/deploy/profiles.js";
import { maskValue, isSensitiveKey, loadEffectiveConfig } from "../../src/deploy/env-config.js";
import { verifyArtifact } from "../../src/deploy/artifact.js";

describe("Phase 14 Security & Robustness Fuzzing", () => {
  it("fuzzes target parser with malicious / malformed strings", () => {
    const payloads = [
      "",
      "../../etc/passwd",
      "; rm -rf /",
      "\x00x86_64-linux",
      "x86_64-linux-gnu-extra-long-invalid-triple-specifier",
      "a".repeat(1000),
    ];

    for (const p of payloads) {
      expect(() => parseTarget(p)).toThrow();
    }
  });

  it("fuzzes build profile resolver with invalid identifiers", () => {
    const invalid = ["", "debug_fake", "O4", "-O3", "--release", "DROP TABLE profiles;"];
    for (const p of invalid) {
      expect(() => resolveProfile(p)).toThrow();
    }
  });

  it("fuzzes secret detection with variety of sensitive token patterns", () => {
    const sensitiveKeys = [
      "AWS_SECRET_ACCESS_KEY",
      "GITHUB_TOKEN",
      "POSTGRES_PASSWORD",
      "API_KEY",
      "PRIVATE_KEY_PEM",
      "AUTH_BEARER",
      "APP_PASSWD",
      "DB_CREDENTIAL",
    ];

    for (const key of sensitiveKeys) {
      expect(isSensitiveKey(key)).toBe(true);
      expect(maskValue(key, "super-secret-12345")).toBe("********");
    }

    const safeKeys = ["PORT", "HOST", "NODE_ENV", "TIMEOUT_MS", "MAX_CONNECTIONS"];
    for (const key of safeKeys) {
      expect(isSensitiveKey(key)).toBe(false);
      expect(maskValue(key, "safe-val")).toBe("safe-val");
    }
  });

  it("verifies artifact integrity rejects path traversal / corrupt files", () => {
    expect(verifyArtifact("../../../etc/shadow").valid).toBe(false);
    expect(verifyArtifact("C:\\non_existent_path_xyz").valid).toBe(false);
  });
});
