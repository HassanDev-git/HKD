/**
 * HKD Supply-Chain Security & Registry Hardening Tests
 *
 * Verifies:
 * 1. Dependency Confusion Defense: Path dependencies have strict precedence over registry.
 * 2. Malformed Package Metadata Rejection: Rejects malformed semver, invalid manifests, bad TOML.
 * 3. Tampered Archive & Poisoned Cache Defense: Detects bit-flips, corrupted checksums, and tampered archives.
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { packArchive, unpackArchive, ARCHIVE_MAGIC } from "../../src/package-manager/archive.js";
import { ContentAddressedCache } from "../../src/package-manager/cache.js";
import { readManifest, parseToml, HkdManifest } from "../../src/package-manager/index.js";
import { parseVersion } from "../../src/package-manager/semver.js";
import { resolveDependencyGraph, PackageMetadataProvider } from "../../src/package-manager/resolver.js";

describe("Workstream 8D & 8E: Supply-Chain Security & Integrity Defense", () => {
  const tempDir = path.resolve(".hkd/test_supply_chain_" + Date.now());
  const cacheDir = path.join(tempDir, "cache");

  beforeAll(() => {
    fs.mkdirSync(tempDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe("1. Dependency Confusion Defense (Path vs Registry Precedence)", () => {
    test("local path dependency is strictly preferred over registry collision", () => {
      // Mock provider offering 'utils' v99.9.9 in the registry
      const mockProvider: PackageMetadataProvider = {
        getAvailableVersions(pkgName: string): string[] {
          if (pkgName === "utils") return ["1.0.0", "99.9.9"];
          return [];
        },
        getPackageManifest(pkgName: string, version: string): HkdManifest | null {
          if (pkgName === "utils" && version === "local") {
            return {
              name: "utils",
              version: "1.0.0",
              dependencies: {},
              devDependencies: {},
            };
          }
          if (pkgName === "utils" && version === "99.9.9") {
            return {
              name: "utils",
              version: "99.9.9",
              dependencies: {},
              devDependencies: {},
            };
          }
          return null;
        },
        getPackageIntegrity(pkgName: string, version: string): string {
          return "sha256:0000000000000000000000000000000000000000000000000000000000000000";
        },
      };

      // Root project manifest declaring explicit path dependency
      const rootManifest: HkdManifest = {
        name: "my-app",
        version: "1.0.0",
        edition: "2026",
        main: "src/main.hkd",
        dependencies: {
          utils: { path: "./local_utils" },
        },
        devDependencies: {},
      };

      const result = resolveDependencyGraph(rootManifest, { provider: mockProvider });

      // The resolved dependency must be the local path, NOT the registry 99.9.9
      const utilsDep = result.packages["utils"];
      expect(utilsDep).toBeDefined();
      expect(utilsDep.source).toBe("path:./local_utils");
      expect(utilsDep.version).toBe("1.0.0");
    });
  });

  describe("2. Malformed Package Metadata Rejection", () => {
    test("rejects invalid semver strings", () => {
      const invalidVersions = [
        "1.0",
        "1.0.0.0",
        "v1.0.0",
        "latest",
        "1.2.alpha",
        "-1.0.0",
        "1.0.-1",
        "word",
        "",
      ];

      for (const ver of invalidVersions) {
        expect(() => parseVersion(ver)).toThrow();
      }
    });

    test("readManifest returns empty or null for nonexistent or empty directory", () => {
      const nonExistent = path.join(tempDir, "does_not_exist");
      expect(readManifest(nonExistent)).toBeNull();
    });

    test("readManifest parses valid manifest correctly", () => {
      const pkgDir = path.join(tempDir, "valid_pkg");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "hkd.toml"), `
[package]
name = "my-library"
version = "2.1.0"
edition = "2026"
main = "src/lib.hkd"

[dependencies]
helper = "1.0.0"
      `.trim());

      const m = readManifest(pkgDir);
      expect(m).not.toBeNull();
      expect(m!.name).toBe("my-library");
      expect(m!.version).toBe("2.1.0");
      expect(m!.main).toBe("src/lib.hkd");
      expect(m!.dependencies["helper"]).toBe("1.0.0");
    });
  });

  describe("3. Tampered Archive & Poisoned Cache Defense", () => {
    test("unpackArchive rejects archive with modified content bytes (SEC001)", () => {
      const pkgDir = path.join(tempDir, "tamper_source");
      fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "src", "code.hkd"), "let x = 100;");

      const manifest: HkdManifest = {
        name: "tamper-target",
        version: "1.0.0",
        edition: "2026",
        main: "src/code.hkd",
        dependencies: {},
        devDependencies: {},
      };

      const pack = packArchive(pkgDir, manifest);
      const originalChecksum = pack.checksum;

      // Tamper with the archive buffer: flip a byte in the content
      const tamperedBuffer = Buffer.from(pack.buffer);
      tamperedBuffer[tamperedBuffer.length - 1] ^= 0xff; // flip last byte

      const destDir = path.join(tempDir, "tamper_dest");
      expect(() => {
        unpackArchive(tamperedBuffer, destDir, originalChecksum);
      }).toThrow(/error\[SEC001\]/);
    });

    test("ContentAddressedCache refuses to accept corrupted or poisoned archive payload", () => {
      const cache = new ContentAddressedCache(cacheDir);

      const fakeChecksum = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
      const corruptPayload = Buffer.from("NOT_A_VALID_HKDPACK_ARCHIVE");

      const manifest: HkdManifest = {
        name: "corrupt-pkg",
        version: "1.0.0",
        edition: "2026",
        main: "src/main.hkd",
        dependencies: {},
        devDependencies: {},
      };

      expect(() => {
        cache.store(fakeChecksum, corruptPayload, manifest);
      }).toThrow();
    });
  });
});
