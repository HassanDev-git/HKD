/**
 * HKD Package Manager 2.0
 *
 * Unified orchestrator for all package commands: add, remove, install, update,
 * pack, publish, search, info, vendor, and cache management.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { HkdManifest, readManifest, writeManifest } from "./index.js";
import { normalizePackageName, validatePackageName } from "./identity.js";
import { parseVersion, satisfies } from "./semver.js";
import { packArchive, unpackArchive } from "./archive.js";
import { ContentAddressedCache } from "./cache.js";
import { LockfileV2, readLockfile, writeLockfile } from "./lockfile.js";
import { resolveDependencyGraph, PackageMetadataProvider } from "./resolver.js";
import { RegistryClient } from "./registry/registry-client.js";
import { HttpRegistryClient } from "./registry/registry-http.js";
import { MockRegistryClient } from "./registry/registry-mock.js";
import { LanguageEdition, DEFAULT_EDITION } from "../utils/index.js";

export interface InstallOptions {
  offline?: boolean;
  locked?: boolean;
  vendor?: boolean;
  quiet?: boolean;
  existingLockOverride?: LockfileV2 | null;
  path?: string;
}

export interface PackageManagerResult {
  ok: boolean;
  message: string;
}

export class PackageManager2 {
  public cache: ContentAddressedCache;
  public registry: RegistryClient;

  constructor(options?: { cacheDir?: string; registry?: RegistryClient }) {
    this.cache = new ContentAddressedCache(options?.cacheDir);
    this.registry = options?.registry || new HttpRegistryClient();
  }

  /**
   * Initializes a new HKD project.
   */
  init(dir: string, name: string, template = "cli", edition: LanguageEdition = DEFAULT_EDITION): PackageManagerResult {
    const manifestPath = path.join(dir, "hkd.toml");
    if (fs.existsSync(manifestPath)) {
      return { ok: false, message: "hkd.toml already exists in this directory" };
    }

    const pkgName = normalizePackageName(name || path.basename(path.resolve(dir)));
    const manifest: HkdManifest = {
      name: pkgName,
      version: "0.1.0",
      edition,
      description: "",
      author: "",
      license: "MIT",
      main: "src/main.hkd",
      dependencies: {},
      devDependencies: {},
    };

    writeManifest(dir, manifest);

    // Create src/
    const srcDir = path.join(dir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const mainPath = path.join(srcDir, "main.hkd");
    if (!fs.existsSync(mainPath)) {
      if (edition === "2027") {
        fs.writeFileSync(mainPath, `// HKD 1.1 / Edition 2027\nprint("Hello from ${pkgName}!");\n`, "utf-8");
      } else {
        fs.writeFileSync(mainPath, `print("Hello from ${pkgName}!");\n`, "utf-8");
      }
    }

    // Create tests/
    const testsDir = path.join(dir, "tests");
    fs.mkdirSync(testsDir, { recursive: true });
    const testPath = path.join(testsDir, "main.test.hkd");
    if (!fs.existsSync(testPath)) {
      if (edition === "2027") {
        fs.writeFileSync(
          testPath,
          `test "edition 2027 test" {\n    assert(1 + 1 == 2, "1 + 1 must equal 2")\n}\n`,
          "utf-8"
        );
      } else {
        fs.writeFileSync(
          testPath,
          `test "basic math works" {\n    assert(1 + 1 == 2, "1 + 1 must equal 2")\n}\n`,
          "utf-8"
        );
      }
    }

    return { ok: true, message: `Created project '${pkgName}' (edition ${edition}) inside ${dir}` };
  }

  /**
   * Builds the PackageMetadataProvider bridging local cache, path dependencies, and registry.
   */
  private createProvider(dir: string, offline: boolean): PackageMetadataProvider {
    return {
      getAvailableVersions: (pkgName: string): string[] => {
        const versions: Set<string> = new Set();

        // 1. Check local cache
        for (const entry of this.cache.list()) {
          if (entry.name === pkgName) {
            versions.add(entry.version);
          }
        }

        // 2. If online, fetch from registry synchronously or preloaded
        if (!offline) {
          // For synchronous resolver loop, query registry cache / metadata
          // In practice, resolver requests version list
        }

        return Array.from(versions).sort((a, b) => a.localeCompare(b));
      },

      getPackageManifest: (pkgName: string, version: string): HkdManifest | null => {
        // Path dependency
        if (version === "local") {
          const rootManifest = readManifest(dir);
          const depEntry = rootManifest?.dependencies?.[pkgName] || rootManifest?.devDependencies?.[pkgName];
          if (typeof depEntry === "object" && depEntry !== null && "path" in depEntry) {
            const pathDepDir = path.resolve(dir, depEntry.path);
            return readManifest(pathDepDir);
          }
          const pathDepDir = path.resolve(dir, pkgName);
          return readManifest(pathDepDir);
        }

        for (const entry of this.cache.list()) {
          if (entry.name === pkgName && entry.version === version) {
            const cached = this.cache.get(entry.checksum);
            if (cached) return cached.manifest;
          }
        }
        return null;
      },

      getPackageIntegrity: (pkgName: string, version: string): string => {
        if (version === "local") {
          const rootManifest = readManifest(dir);
          const depEntry = rootManifest?.dependencies?.[pkgName] || rootManifest?.devDependencies?.[pkgName];
          let targetPath = path.resolve(dir, pkgName);
          if (typeof depEntry === "object" && depEntry !== null && "path" in depEntry) {
            targetPath = path.resolve(dir, depEntry.path);
          }
          const m = readManifest(targetPath);
          if (m) {
            const hash = crypto.createHash("sha256").update(JSON.stringify(m)).digest("hex");
            return `sha256:${hash}`;
          }
        }
        for (const entry of this.cache.list()) {
          if (entry.name === pkgName && entry.version === version) {
            return entry.checksum;
          }
        }
        return "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      },
    };
  }

  /**
   * Installs all dependencies declared in hkd.toml / hkd.lock.
   */
  async install(dir: string, options: InstallOptions = {}): Promise<PackageManagerResult> {
    const manifest = readManifest(dir);
    if (!manifest) {
      return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
    }

    const offline = options.offline || process.env.HKD_OFFLINE === "1";
    const existingLock = options.existingLockOverride !== undefined ? options.existingLockOverride : readLockfile(dir);

    if (options.locked && !existingLock) {
      return { ok: false, message: "error[PKG010]: --locked specified but no hkd.lock found" };
    }

    // Prefetch missing direct and transitive dependencies from registry into cache if online
    if (!offline) {
      const toFetch: string[] = Object.keys(manifest.dependencies).map(normalizePackageName);
      const fetched: Set<string> = new Set();

      while (toFetch.length > 0) {
        const name = toFetch.shift()!;
        if (fetched.has(name)) continue;
        fetched.add(name);

        try {
          const meta = await this.registry.getPackageMetadata(name);
          if (meta) {
            for (const [ver, info] of Object.entries(meta.versions)) {
              if (!this.cache.has(info.checksum)) {
                try {
                  const download = await this.registry.downloadPackage(name, ver);
                  const unpacked = unpackArchive(download.buffer, path.join(dir, ".hkd", "tmp_unpack"), download.checksum);
                  this.cache.store(download.checksum, download.buffer, unpacked.manifest);
                  if (unpacked.manifest?.dependencies) {
                    for (const depName of Object.keys(unpacked.manifest.dependencies)) {
                      const norm = normalizePackageName(depName);
                      if (!fetched.has(norm)) {
                        toFetch.push(norm);
                      }
                    }
                  }
                } catch {}
              } else {
                const cached = this.cache.get(info.checksum);
                if (cached?.manifest?.dependencies) {
                  for (const depName of Object.keys(cached.manifest.dependencies)) {
                    const norm = normalizePackageName(depName);
                    if (!fetched.has(norm)) {
                      toFetch.push(norm);
                    }
                  }
                }
              }
            }
          }
        } catch {}
      }
    }


    const provider = this.createProvider(dir, offline);

    let resolution;
    try {
      resolution = resolveDependencyGraph(manifest, {
        existingLockfile: existingLock,
        provider,
        offline,
      });
    } catch (err: any) {
      return { ok: false, message: err.message };
    }

    if (options.locked && existingLock) {
      // Check if newly resolved lockfile differs from existing
      const existingToml = JSON.stringify(existingLock.packages);
      const newToml = JSON.stringify(resolution.lockfile.packages);
      if (existingToml !== newToml) {
        return { ok: false, message: "error[PKG010]: Dependencies in hkd.toml do not match locked hkd.lock in --locked mode" };
      }
    } else {
      writeLockfile(dir, resolution.lockfile);
    }

    // Deploy to .hkd/deps/
    const depsDir = path.join(dir, ".hkd", "deps");
    if (fs.existsSync(depsDir)) {
      fs.rmSync(depsDir, { recursive: true, force: true });
    }
    fs.mkdirSync(depsDir, { recursive: true });

    // Optional vendoring
    const vendorDir = options.vendor ? path.join(dir, "vendor") : null;
    if (vendorDir) {
      if (fs.existsSync(vendorDir)) {
        fs.rmSync(vendorDir, { recursive: true, force: true });
      }
      fs.mkdirSync(vendorDir, { recursive: true });
    }

    const messages: string[] = [];
    for (const [name, node] of Object.entries(resolution.packages)) {
      let sourceDir = "";
      if (node.source.startsWith("path:")) {
        sourceDir = path.resolve(dir, node.source.slice(5));
      } else {
        const cached = this.cache.get(node.checksum);
        if (cached) {
          sourceDir = cached.dir;
        } else {
          return { ok: false, message: `error[PKG011]: Package '${name}@${node.version}' could not be extracted from cache` };
        }
      }

      const destDir = path.join(depsDir, name);
      this.copyDirClean(sourceDir, destDir);

      if (vendorDir) {
        const vDest = path.join(vendorDir, name);
        this.copyDirClean(sourceDir, vDest);
      }

      messages.push(`  ✓ ${name}@${node.version} (${node.checksum.slice(0, 14)}...)`);
    }

    return {
      ok: true,
      message: `Installed ${Object.keys(resolution.packages).length} package(s):\n${messages.join("\n")}`,
    };
  }

  /**
   * Adds a new dependency and runs installation.
   * Supports:
   * - Registry package: `hkd add http@^1.0.0` or `hkd add http`
   * - Local path: `hkd add ../my-lib` or `hkd add my-lib --path ../my-lib`
   * - Archive: `hkd add ./vendor/my-pkg.hkdpack`
   */
  async add(dir: string, pkgSpec: string, options: InstallOptions = {}): Promise<PackageManagerResult> {
    const manifest = readManifest(dir);
    if (!manifest) {
      return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
    }

    if (options.path) {
      const targetDir = path.resolve(dir, options.path);
      const targetManifest = readManifest(targetDir);
      if (!targetManifest) {
        return { ok: false, message: `No hkd.toml found in path '${options.path}'` };
      }
      const pkgName = normalizePackageName(pkgSpec || targetManifest.name);
      const relPath = path.relative(dir, targetDir).replace(/\\/g, "/");
      manifest.dependencies[pkgName] = { path: relPath } as any;
      writeManifest(dir, manifest);
      return this.install(dir, options);
    }

    if (pkgSpec.endsWith(".hkdpack")) {
      const archivePath = path.resolve(dir, pkgSpec);
      if (!fs.existsSync(archivePath)) {
        return { ok: false, message: `Archive file not found: ${pkgSpec}` };
      }
      const archiveBuf = fs.readFileSync(archivePath);
      const tmpExtract = path.join(dir, ".hkd", "tmp_pack_add");
      const unpacked = unpackArchive(archiveBuf, tmpExtract);
      fs.rmSync(tmpExtract, { recursive: true, force: true });
      this.cache.store(unpacked.checksum, archiveBuf, unpacked.manifest);
      manifest.dependencies[unpacked.manifest.name] = unpacked.manifest.version;
      writeManifest(dir, manifest);
      return this.install(dir, options);
    }

    const resolvedPath = path.resolve(dir, pkgSpec);
    if (
      (pkgSpec.startsWith(".") || pkgSpec.startsWith("/") || pkgSpec.startsWith("\\") || fs.existsSync(resolvedPath)) &&
      fs.existsSync(resolvedPath) &&
      fs.statSync(resolvedPath).isDirectory()
    ) {
      const targetManifest = readManifest(resolvedPath);
      if (!targetManifest) {
        return { ok: false, message: `No hkd.toml found in directory '${pkgSpec}'` };
      }
      const pkgName = normalizePackageName(targetManifest.name);
      const relPath = path.relative(dir, resolvedPath).replace(/\\/g, "/");
      manifest.dependencies[pkgName] = { path: relPath } as any;
      writeManifest(dir, manifest);
      return this.install(dir, options);
    }

    let pkgName = "";
    let range = "*";

    if (pkgSpec.includes("@")) {
      const atIdx = pkgSpec.indexOf("@");
      pkgName = pkgSpec.slice(0, atIdx);
      range = pkgSpec.slice(atIdx + 1) || "*";
    } else {
      pkgName = pkgSpec;
    }

    const valRes = validatePackageName(pkgName);
    if (!valRes.valid) {
      return { ok: false, message: `Invalid package name '${pkgName}': ${valRes.error}` };
    }

    manifest.dependencies[pkgName] = range;
    writeManifest(dir, manifest);

    return this.install(dir, options);
  }

  /**
   * Removes a dependency and prunes tree.
   */
  async remove(dir: string, rawName: string, options: InstallOptions = {}): Promise<PackageManagerResult> {
    const manifest = readManifest(dir);
    if (!manifest) {
      return { ok: false, message: "No hkd.toml found." };
    }

    const name = normalizePackageName(rawName);
    if (!(name in manifest.dependencies) && !(name in manifest.devDependencies)) {
      return { ok: false, message: `Package '${name}' is not listed in dependencies.` };
    }

    delete manifest.dependencies[name];
    delete manifest.devDependencies[name];
    writeManifest(dir, manifest);

    return this.install(dir, options);
  }

  /**
   * Updates dependencies within version ranges.
   * If pkgName is specified, only that dependency is re-resolved.
   * Otherwise, all dependencies are re-resolved.
   */
  async update(dir: string, pkgName?: string, options: InstallOptions = {}): Promise<PackageManagerResult> {
    const manifest = readManifest(dir);
    if (!manifest) {
      return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
    }

    let existingLock = readLockfile(dir);
    if (existingLock && pkgName) {
      const norm = normalizePackageName(pkgName);
      existingLock.packages = existingLock.packages.filter((p) => p.name !== norm);
    } else {
      existingLock = null;
    }

    return this.install(dir, { ...options, existingLockOverride: existingLock });
  }

  /**
   * Packs directory into deterministic .hkdpack archive.
   */
  pack(dir: string): { path: string; checksum: string } {
    const manifest = readManifest(dir);
    if (!manifest) throw new Error("No hkd.toml found to pack");

    const outName = `${manifest.name}-${manifest.version}.hkdpack`;
    const outPath = path.join(dir, outName);

    const pack = packArchive(dir, manifest);
    fs.writeFileSync(outPath, pack.buffer);

    return { path: outPath, checksum: pack.checksum };
  }

  /**
   * Publishes package to registry.
   */
  async publish(dir: string, token?: string): Promise<PackageManagerResult> {
    const manifest = readManifest(dir);
    if (!manifest) {
      return { ok: false, message: "No hkd.toml found to publish" };
    }

    const valName = validatePackageName(manifest.name);
    if (!valName.valid) {
      return { ok: false, message: `Cannot publish: invalid package name '${manifest.name}': ${valName.error}` };
    }

    try {
      parseVersion(manifest.version);
    } catch {
      return { ok: false, message: `Cannot publish: invalid SemVer version '${manifest.version}'` };
    }

    const pack = packArchive(dir, manifest);
    const pubRes = await this.registry.publishPackage(manifest, pack.buffer, token);
    return pubRes;
  }

  /**
   * Searches registry.
   */
  async search(query: string, limit = 20) {
    return this.registry.searchPackages(query, limit);
  }

  /**
   * Queries package info.
   */
  async info(pkgName: string) {
    return this.registry.getPackageMetadata(normalizePackageName(pkgName));
  }

  /**
   * Vendors all dependencies into vendor/ directory.
   */
  async vendor(dir: string): Promise<PackageManagerResult> {
    return this.install(dir, { vendor: true });
  }

  private copyDirClean(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === "target" ||
        entry.name === ".hkd" ||
        entry.name.endsWith(".hkdpack")
      ) {
        continue;
      }
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        this.copyDirClean(s, d);
      } else {
        fs.copyFileSync(s, d);
      }
    }
  }
}
