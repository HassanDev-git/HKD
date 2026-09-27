/**
 * HKD Package Ecosystem Diamond Dependency & Offline Resilience Tests
 *
 * Verifies:
 * 1. Diamond dependency resolution & single-instance deduplication
 * 2. Deterministic lockfile byte-for-byte reproducibility
 * 3. Offline mode strict cache-only contract
 * 4. Corrupted package archive detection and rejection
 * 5. Circular dependency detection and error reporting
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { PackageManager2 } from "../../src/package-manager/manager.js";
import { MockRegistryClient } from "../../src/package-manager/registry/registry-mock.js";
import { packArchive, unpackArchive } from "../../src/package-manager/archive.js";
import { resolveDependencyGraph } from "../../src/package-manager/resolver.js";
import { serializeLockfileV2 } from "../../src/package-manager/lockfile.js";

describe("HKD Package Ecosystem — Diamond Dependencies & Offline Resilience", () => {
  const sandbox = path.resolve(".hkd/test_diamond_sandbox");
  const cacheDir = path.join(sandbox, "cache");

  beforeAll(() => {
    fs.mkdirSync(sandbox, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(sandbox, { recursive: true, force: true });
    } catch {}
  });

  test("resolves diamond dependency graph with single-version deduplication", async () => {
    const mockRegistry = new MockRegistryClient();
    const pm = new PackageManager2({ cacheDir, registry: mockRegistry });

    // 1. Seed pkg-c versions: 1.0.0 and 1.2.0
    const pkgCDir = path.join(sandbox, "pkg-c-src");
    fs.mkdirSync(path.join(pkgCDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgCDir, "src", "main.hkd"), "export fn c() { return 42; }\n");

    const manifestC1 = { name: "pkg-c", version: "1.0.0", dependencies: {}, devDependencies: {} };
    const packC1 = packArchive(pkgCDir, manifestC1);
    await mockRegistry.publishPackage(manifestC1, packC1.buffer);

    const manifestC2 = { name: "pkg-c", version: "1.2.0", dependencies: {}, devDependencies: {} };
    const packC2 = packArchive(pkgCDir, manifestC2);
    await mockRegistry.publishPackage(manifestC2, packC2.buffer);

    // 2. Seed pkg-a depending on pkg-c@^1.0.0
    const pkgADir = path.join(sandbox, "pkg-a-src");
    fs.mkdirSync(path.join(pkgADir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgADir, "src", "main.hkd"), "import pkg-c\nexport fn a() { return 1; }\n");
    const manifestA = {
      name: "pkg-a",
      version: "1.0.0",
      dependencies: { "pkg-c": "^1.0.0" },
      devDependencies: {},
    };
    const packA = packArchive(pkgADir, manifestA);
    await mockRegistry.publishPackage(manifestA, packA.buffer);

    // 3. Seed pkg-b depending on pkg-c@^1.1.0
    const pkgBDir = path.join(sandbox, "pkg-b-src");
    fs.mkdirSync(path.join(pkgBDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(pkgBDir, "src", "main.hkd"), "import pkg-c\nexport fn b() { return 2; }\n");
    const manifestB = {
      name: "pkg-b",
      version: "1.0.0",
      dependencies: { "pkg-c": "^1.1.0" },
      devDependencies: {},
    };
    const packB = packArchive(pkgBDir, manifestB);
    await mockRegistry.publishPackage(manifestB, packB.buffer);

    // 4. Root app depending on pkg-a and pkg-b (Diamond topology)
    const appDir = path.join(sandbox, "diamond-app");
    pm.init(appDir, "diamond-app");

    await pm.add(appDir, "pkg-a@^1.0.0");
    await pm.add(appDir, "pkg-b@^1.0.0");

    const installRes = await pm.install(appDir);
    expect(installRes.ok).toBe(true);

    // Check lockfile: pkg-c must be resolved to 1.2.0 (satisfies both ^1.0.0 and ^1.1.0)
    // and appear exactly once!
    const lockPath = path.join(appDir, "hkd.lock");
    expect(fs.existsSync(lockPath)).toBe(true);
    const lockContent = fs.readFileSync(lockPath, "utf-8");

    const pkgCOccurrences = (lockContent.match(/name = "pkg-c"/g) || []).length;
    expect(pkgCOccurrences).toBe(1);
    expect(lockContent).toContain('name = "pkg-c"\nversion = "1.2.0"');
  });

  test("produces deterministic lockfile across multiple resolution passes", async () => {
    const mockRegistry = new MockRegistryClient();
    const pm = new PackageManager2({ cacheDir, registry: mockRegistry });

    const appDir = path.join(sandbox, "diamond-app");
    const lockPath = path.join(appDir, "hkd.lock");
    const firstLock = fs.readFileSync(lockPath, "utf-8");

    // Re-install multiple times
    for (let i = 0; i < 3; i++) {
      const res = await pm.install(appDir);
      expect(res.ok).toBe(true);
      const subsequentLock = fs.readFileSync(lockPath, "utf-8");
      expect(subsequentLock).toBe(firstLock);
    }
  });

  test("offline mode succeeds when all packages are cached locally", async () => {
    const mockRegistry = new MockRegistryClient();
    const pm = new PackageManager2({ cacheDir, registry: mockRegistry });

    const appDir = path.join(sandbox, "diamond-app");
    // Install in offline mode (cache is already populated from previous test)
    const offlineRes = await pm.install(appDir, { offline: true });
    expect(offlineRes.ok).toBe(true);
  });

  test("offline mode fails cleanly when dependencies are missing from cache", async () => {
    const mockRegistry = new MockRegistryClient();
    // Fresh cache dir with zero cached packages
    const emptyCacheDir = path.join(sandbox, "empty-cache");
    fs.mkdirSync(emptyCacheDir, { recursive: true });
    const pm = new PackageManager2({ cacheDir: emptyCacheDir, registry: mockRegistry });

    const freshAppDir = path.join(sandbox, "offline-missing-app");
    pm.init(freshAppDir, "offline-missing-app");

    // Manually add un-cached dependency to manifest
    const manifestPath = path.join(freshAppDir, "hkd.toml");
    let content = fs.readFileSync(manifestPath, "utf-8");
    content += '\n[dependencies]\n"uncached-lib" = "^1.0.0"\n';
    fs.writeFileSync(manifestPath, content, "utf-8");

    const res = await pm.install(freshAppDir, { offline: true });
    expect(res.ok).toBe(false);
    expect(res.message).toBeDefined();
  });

  test("rejects corrupted package archive with SHA-256 mismatch", () => {
    const testDir = path.join(sandbox, "corrupt-test");
    fs.mkdirSync(path.join(testDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "src", "main.hkd"), "let x = 10;\n");

    const manifest = { name: "corrupt-pkg", version: "1.0.0", dependencies: {}, devDependencies: {} };
    const { buffer, checksum } = packArchive(testDir, manifest);

    // Tamper with buffer payload (flip a byte in middle)
    const tamperedBuffer = Buffer.from(buffer);
    tamperedBuffer[tamperedBuffer.length - 10] ^= 0xff;

    // Unpacking with expected original checksum must throw integrity failure
    const outUnpack = path.join(sandbox, "corrupt-unpack");
    expect(() => {
      unpackArchive(tamperedBuffer, outUnpack, checksum);
    }).toThrow(/integrity failure|SEC001/);
  });

  test("detects circular dependency and prevents infinite loop", () => {
    const mockRegistry = new MockRegistryClient();
    const manifestX = {
      name: "cycle-x",
      version: "1.0.0",
      dependencies: { "cycle-y": "1.0.0" },
      devDependencies: {},
    };
    const manifestY = {
      name: "cycle-y",
      version: "1.0.0",
      dependencies: { "cycle-x": "1.0.0" },
      devDependencies: {},
    };

    const provider = {
      getAvailableVersions: (name: string) => ["1.0.0"],
      getPackageManifest: (name: string, ver: string) => {
        if (name === "cycle-x") return manifestX;
        if (name === "cycle-y") return manifestY;
        return null;
      },
      getPackageIntegrity: () => "sha256:" + "0".repeat(64),
    };

    const rootManifest = {
      name: "root-cycle",
      version: "1.0.0",
      dependencies: { "cycle-x": "1.0.0" },
      devDependencies: {},
    };

    // Resolving circular dependency must cleanly throw cycle detection error
    expect(() => {
      resolveDependencyGraph(rootManifest, { provider });
    }).toThrow(/Circular dependency cycle detected/);
  });

});
