import { describe, test, expect } from "@jest/globals";
import {
  resolveDependencyGraph,
  PackageMetadataProvider,
} from "../../src/package-manager/resolver.js";
import {
  serializeLockfileV2,
  parseLockfileV2,
  migrateLockfileV1,
  LockfileV2,
} from "../../src/package-manager/lockfile.js";
import { HkdManifest } from "../../src/package-manager/index.js";

describe("HKD Phase 12D & 12E — Dependency Resolution 2.0 & Lockfile V2", () => {
  const mockProvider: PackageMetadataProvider = {
    getAvailableVersions(pkgName: string): string[] {
      const registry: Record<string, string[]> = {
        http: ["1.0.0", "1.1.0", "1.2.0", "2.0.0"],
        buffer: ["0.9.0", "1.0.0", "1.1.0", "1.2.0"],
        sys: ["0.1.0", "0.2.0"],
        logger: ["1.0.0", "2.0.0"],
        conflicted: ["1.0.0", "2.0.0"],
        cycle_a: ["1.0.0"],
        cycle_b: ["1.0.0"],
      };
      return registry[pkgName] || [];
    },

    getPackageManifest(pkgName: string, version: string): HkdManifest | null {
      if (pkgName === "http" && (version === "1.2.0" || version === "1.1.0")) {
        return {
          name: "http",
          version,
          dependencies: { buffer: "^1.0.0" },
          devDependencies: {},
        };
      }
      if (pkgName === "http" && version === "2.0.0") {
        return {
          name: "http",
          version: "2.0.0",
          dependencies: { buffer: "^1.2.0" },
          devDependencies: {},
        };
      }
      if (pkgName === "buffer") {
        return {
          name: "buffer",
          version,
          dependencies: { sys: ">=0.1.0" },
          devDependencies: {},
        };
      }
      if (pkgName === "sys") {
        return {
          name: "sys",
          version,
          dependencies: {},
          devDependencies: {},
        };
      }
      if (pkgName === "logger") {
        return {
          name: "logger",
          version,
          dependencies: { buffer: "~1.0.0" },
          devDependencies: {},
        };
      }
      if (pkgName === "cycle_a") {
        return {
          name: "cycle_a",
          version: "1.0.0",
          dependencies: { cycle_b: "1.0.0" },
          devDependencies: {},
        };
      }
      if (pkgName === "cycle_b") {
        return {
          name: "cycle_b",
          version: "1.0.0",
          dependencies: { cycle_a: "1.0.0" },
          devDependencies: {},
        };
      }
      return {
        name: pkgName,
        version,
        dependencies: {},
        devDependencies: {},
      };
    },

    getPackageIntegrity(pkgName: string, version: string): string {
      return `sha256:mock_hash_for_${pkgName}_${version}`;
    },
  };

  test("Resolves transitive dependencies deterministically", () => {
    const rootManifest: HkdManifest = {
      name: "my-app",
      version: "0.1.0",
      dependencies: {
        http: "^1.0.0",
      },
      devDependencies: {},
    };

    const res = resolveDependencyGraph(rootManifest, { provider: mockProvider });

    // http@1.2.0 -> buffer@1.2.0 -> sys@0.2.0
    expect(res.packages["http"]).toBeDefined();
    expect(res.packages["http"].version).toBe("1.2.0");

    expect(res.packages["buffer"]).toBeDefined();
    expect(res.packages["buffer"].version).toBe("1.2.0");

    expect(res.packages["sys"]).toBeDefined();
    expect(res.packages["sys"].version).toBe("0.2.0");

    // Lockfile structure
    expect(res.lockfile.version).toBe(2);
    expect(res.lockfile.packages.map((p) => p.name)).toEqual(["buffer", "http", "sys"]);
  });

  test("Resolves diamond dependencies with compatible range intersection", () => {
    const rootManifest: HkdManifest = {
      name: "diamond-app",
      version: "0.1.0",
      dependencies: {
        http: "^1.0.0", // requires buffer ^1.0.0
        logger: "^1.0.0", // requires buffer ~1.0.0
      },
      devDependencies: {},
    };

    const res = resolveDependencyGraph(rootManifest, { provider: mockProvider });

    // ~1.0.0 and ^1.0.0 intersect at 1.0.x; available: 1.0.0 -> chosen: 1.0.0
    expect(res.packages["buffer"].version).toBe("1.0.0");
  });

  test("Detects dependency version conflicts and raises PKG001", () => {
    const conflictingProvider: PackageMetadataProvider = {
      ...mockProvider,
      getPackageManifest(pkgName: string, version: string) {
        if (pkgName === "dep_a") {
          return { name: "dep_a", version, dependencies: { conflicted: "^1.0.0" }, devDependencies: {} };
        }
        if (pkgName === "dep_b") {
          return { name: "dep_b", version, dependencies: { conflicted: "^2.0.0" }, devDependencies: {} };
        }
        return mockProvider.getPackageManifest(pkgName, version);
      },
      getAvailableVersions(pkgName: string) {
        if (pkgName === "dep_a") return ["1.0.0"];
        if (pkgName === "dep_b") return ["1.0.0"];
        return mockProvider.getAvailableVersions(pkgName);
      },
    };

    const rootManifest: HkdManifest = {
      name: "conflict-app",
      version: "0.1.0",
      dependencies: {
        dep_a: "1.0.0",
        dep_b: "1.0.0",
      },
      devDependencies: {},
    };

    expect(() =>
      resolveDependencyGraph(rootManifest, { provider: conflictingProvider })
    ).toThrow(/error\[PKG001\]/);
  });

  test("Detects circular dependency cycles and raises PKG002", () => {
    const rootManifest: HkdManifest = {
      name: "cycle-app",
      version: "0.1.0",
      dependencies: {
        cycle_a: "1.0.0",
      },
      devDependencies: {},
    };

    expect(() =>
      resolveDependencyGraph(rootManifest, { provider: mockProvider })
    ).toThrow(/error\[PKG002\]/);
  });

  test("Lockfile V2 serialization and parsing roundtrip", () => {
    const lockfile: LockfileV2 = {
      version: 2,
      resolver: "2.0",
      packages: [
        {
          name: "buffer",
          version: "1.2.0",
          source: "registry",
          checksum: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          dependencies: ["sys 0.2.0"],
        },
        {
          name: "http",
          version: "1.2.0",
          source: "registry",
          checksum: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          dependencies: ["buffer 1.2.0"],
        },
      ],
    };

    const toml = serializeLockfileV2(lockfile);
    const parsed = parseLockfileV2(toml);

    expect(parsed.version).toBe(2);
    expect(parsed.resolver).toBe("2.0");
    expect(parsed.packages).toEqual(lockfile.packages);
  });

  test("Migrates legacy Lockfile V1 JSON to Lockfile V2 TOML", () => {
    const v1Json = JSON.stringify({
      packages: [
        {
          name: "old_pkg",
          version: "0.5.0",
          source: { checksum: "old_hash" },
          dependencies: { sub_pkg: "0.1.0" },
        },
      ],
    });

    const v2 = migrateLockfileV1(v1Json);
    expect(v2.version).toBe(2);
    expect(v2.packages[0].name).toBe("old_pkg");
    expect(v2.packages[0].version).toBe("0.5.0");
    expect(v2.packages[0].dependencies).toEqual(["sub_pkg 0.1.0"]);
  });

  test("Preserves locked versions from existing lockfile (lockfile replay)", () => {
    const rootManifest: HkdManifest = {
      name: "replay-app",
      version: "0.1.0",
      dependencies: {
        http: "^1.0.0",
      },
      devDependencies: {},
    };

    const existingLockfile: LockfileV2 = {
      version: 2,
      resolver: "2.0",
      packages: [
        {
          name: "http",
          version: "1.1.0", // older version locked in lockfile
          source: "registry",
          checksum: "sha256:locked_hash_1_1_0",
          dependencies: ["buffer 1.1.0"],
        },
        {
          name: "buffer",
          version: "1.1.0",
          source: "registry",
          checksum: "sha256:locked_buffer_1_1_0",
          dependencies: ["sys 0.1.0"],
        },
        {
          name: "sys",
          version: "0.1.0",
          source: "registry",
          checksum: "sha256:locked_sys_0_1_0",
          dependencies: [],
        },
      ],
    };

    const res = resolveDependencyGraph(rootManifest, {
      provider: mockProvider,
      existingLockfile,
    });

    // Should preserve locked 1.1.0 rather than upgrading to available 1.2.0
    expect(res.packages["http"].version).toBe("1.1.0");
    expect(res.packages["buffer"].version).toBe("1.1.0");
    expect(res.packages["sys"].version).toBe("0.1.0");
  });
});
