"use strict";
/**
 * HKD Package Manager 2.0
 *
 * Unified orchestrator for all package commands: add, remove, install, update,
 * pack, publish, search, info, vendor, and cache management.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageManager2 = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("./index.js");
const identity_js_1 = require("./identity.js");
const semver_js_1 = require("./semver.js");
const archive_js_1 = require("./archive.js");
const cache_js_1 = require("./cache.js");
const lockfile_js_1 = require("./lockfile.js");
const resolver_js_1 = require("./resolver.js");
const registry_http_js_1 = require("./registry/registry-http.js");
const index_js_2 = require("../utils/index.js");
class PackageManager2 {
    cache;
    registry;
    constructor(options) {
        this.cache = new cache_js_1.ContentAddressedCache(options?.cacheDir);
        this.registry = options?.registry || new registry_http_js_1.HttpRegistryClient();
    }
    /**
     * Initializes a new HKD project.
     */
    init(dir, name, template = "cli", edition = index_js_2.DEFAULT_EDITION) {
        const manifestPath = path.join(dir, "hkd.toml");
        if (fs.existsSync(manifestPath)) {
            return { ok: false, message: "hkd.toml already exists in this directory" };
        }
        const pkgName = (0, identity_js_1.normalizePackageName)(name || path.basename(path.resolve(dir)));
        const manifest = {
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
        (0, index_js_1.writeManifest)(dir, manifest);
        // Create src/
        const srcDir = path.join(dir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        const mainPath = path.join(srcDir, "main.hkd");
        if (!fs.existsSync(mainPath)) {
            if (edition === "2027") {
                fs.writeFileSync(mainPath, `// HKD 1.1 / Edition 2027\nprint("Hello from ${pkgName}!");\n`, "utf-8");
            }
            else {
                fs.writeFileSync(mainPath, `print("Hello from ${pkgName}!");\n`, "utf-8");
            }
        }
        // Create tests/
        const testsDir = path.join(dir, "tests");
        fs.mkdirSync(testsDir, { recursive: true });
        const testPath = path.join(testsDir, "main.test.hkd");
        if (!fs.existsSync(testPath)) {
            if (edition === "2027") {
                fs.writeFileSync(testPath, `test "edition 2027 test" {\n    assert(1 + 1 == 2, "1 + 1 must equal 2")\n}\n`, "utf-8");
            }
            else {
                fs.writeFileSync(testPath, `test "basic math works" {\n    assert(1 + 1 == 2, "1 + 1 must equal 2")\n}\n`, "utf-8");
            }
        }
        return { ok: true, message: `Created project '${pkgName}' (edition ${edition}) inside ${dir}` };
    }
    /**
     * Builds the PackageMetadataProvider bridging local cache, path dependencies, and registry.
     */
    createProvider(dir, offline) {
        return {
            getAvailableVersions: (pkgName) => {
                const versions = new Set();
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
            getPackageManifest: (pkgName, version) => {
                // Path dependency
                if (version === "local") {
                    const pathDepDir = path.resolve(dir, pkgName);
                    return (0, index_js_1.readManifest)(pathDepDir);
                }
                for (const entry of this.cache.list()) {
                    if (entry.name === pkgName && entry.version === version) {
                        const cached = this.cache.get(entry.checksum);
                        if (cached)
                            return cached.manifest;
                    }
                }
                return null;
            },
            getPackageIntegrity: (pkgName, version) => {
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
    async install(dir, options = {}) {
        const manifest = (0, index_js_1.readManifest)(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
        }
        const offline = options.offline || process.env.HKD_OFFLINE === "1";
        const existingLock = (0, lockfile_js_1.readLockfile)(dir);
        if (options.locked && !existingLock) {
            return { ok: false, message: "error[PKG010]: --locked specified but no hkd.lock found" };
        }
        // Prefetch missing direct and transitive dependencies from registry into cache if online
        if (!offline) {
            const toFetch = Object.keys(manifest.dependencies).map(identity_js_1.normalizePackageName);
            const fetched = new Set();
            while (toFetch.length > 0) {
                const name = toFetch.shift();
                if (fetched.has(name))
                    continue;
                fetched.add(name);
                try {
                    const meta = await this.registry.getPackageMetadata(name);
                    if (meta) {
                        for (const [ver, info] of Object.entries(meta.versions)) {
                            if (!this.cache.has(info.checksum)) {
                                try {
                                    const download = await this.registry.downloadPackage(name, ver);
                                    const unpacked = (0, archive_js_1.unpackArchive)(download.buffer, path.join(dir, ".hkd", "tmp_unpack"), download.checksum);
                                    this.cache.store(download.checksum, download.buffer, unpacked.manifest);
                                    if (unpacked.manifest?.dependencies) {
                                        for (const depName of Object.keys(unpacked.manifest.dependencies)) {
                                            const norm = (0, identity_js_1.normalizePackageName)(depName);
                                            if (!fetched.has(norm)) {
                                                toFetch.push(norm);
                                            }
                                        }
                                    }
                                }
                                catch { }
                            }
                            else {
                                const cached = this.cache.get(info.checksum);
                                if (cached?.manifest?.dependencies) {
                                    for (const depName of Object.keys(cached.manifest.dependencies)) {
                                        const norm = (0, identity_js_1.normalizePackageName)(depName);
                                        if (!fetched.has(norm)) {
                                            toFetch.push(norm);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                catch { }
            }
        }
        const provider = this.createProvider(dir, offline);
        let resolution;
        try {
            resolution = (0, resolver_js_1.resolveDependencyGraph)(manifest, {
                existingLockfile: existingLock,
                provider,
                offline,
            });
        }
        catch (err) {
            return { ok: false, message: err.message };
        }
        if (options.locked && existingLock) {
            // Check if newly resolved lockfile differs from existing
            const existingToml = JSON.stringify(existingLock.packages);
            const newToml = JSON.stringify(resolution.lockfile.packages);
            if (existingToml !== newToml) {
                return { ok: false, message: "error[PKG010]: Dependencies in hkd.toml do not match locked hkd.lock in --locked mode" };
            }
        }
        else {
            (0, lockfile_js_1.writeLockfile)(dir, resolution.lockfile);
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
        const messages = [];
        for (const [name, node] of Object.entries(resolution.packages)) {
            let sourceDir = "";
            if (node.source.startsWith("path:")) {
                sourceDir = path.resolve(dir, node.source.slice(5));
            }
            else {
                const cached = this.cache.get(node.checksum);
                if (cached) {
                    sourceDir = cached.dir;
                }
                else {
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
     */
    async add(dir, pkgSpec, options = {}) {
        const manifest = (0, index_js_1.readManifest)(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found. Run `hkd init` first." };
        }
        let pkgName = "";
        let range = "*";
        if (pkgSpec.includes("@")) {
            const atIdx = pkgSpec.indexOf("@");
            pkgName = pkgSpec.slice(0, atIdx);
            range = pkgSpec.slice(atIdx + 1) || "*";
        }
        else {
            pkgName = pkgSpec;
        }
        const valRes = (0, identity_js_1.validatePackageName)(pkgName);
        if (!valRes.valid) {
            return { ok: false, message: `Invalid package name '${pkgName}': ${valRes.error}` };
        }
        manifest.dependencies[pkgName] = range;
        (0, index_js_1.writeManifest)(dir, manifest);
        return this.install(dir, options);
    }
    /**
     * Removes a dependency and prunes tree.
     */
    async remove(dir, rawName, options = {}) {
        const manifest = (0, index_js_1.readManifest)(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found." };
        }
        const name = (0, identity_js_1.normalizePackageName)(rawName);
        if (!(name in manifest.dependencies) && !(name in manifest.devDependencies)) {
            return { ok: false, message: `Package '${name}' is not listed in dependencies.` };
        }
        delete manifest.dependencies[name];
        delete manifest.devDependencies[name];
        (0, index_js_1.writeManifest)(dir, manifest);
        return this.install(dir, options);
    }
    /**
     * Packs directory into deterministic .hkdpack archive.
     */
    pack(dir) {
        const manifest = (0, index_js_1.readManifest)(dir);
        if (!manifest)
            throw new Error("No hkd.toml found to pack");
        const outName = `${manifest.name}-${manifest.version}.hkdpack`;
        const outPath = path.join(dir, outName);
        const pack = (0, archive_js_1.packArchive)(dir, manifest);
        fs.writeFileSync(outPath, pack.buffer);
        return { path: outPath, checksum: pack.checksum };
    }
    /**
     * Publishes package to registry.
     */
    async publish(dir, token) {
        const manifest = (0, index_js_1.readManifest)(dir);
        if (!manifest) {
            return { ok: false, message: "No hkd.toml found to publish" };
        }
        const valName = (0, identity_js_1.validatePackageName)(manifest.name);
        if (!valName.valid) {
            return { ok: false, message: `Cannot publish: invalid package name '${manifest.name}': ${valName.error}` };
        }
        try {
            (0, semver_js_1.parseVersion)(manifest.version);
        }
        catch {
            return { ok: false, message: `Cannot publish: invalid SemVer version '${manifest.version}'` };
        }
        const pack = (0, archive_js_1.packArchive)(dir, manifest);
        const pubRes = await this.registry.publishPackage(manifest, pack.buffer, token);
        return pubRes;
    }
    /**
     * Searches registry.
     */
    async search(query, limit = 20) {
        return this.registry.searchPackages(query, limit);
    }
    /**
     * Queries package info.
     */
    async info(pkgName) {
        return this.registry.getPackageMetadata((0, identity_js_1.normalizePackageName)(pkgName));
    }
    /**
     * Vendors all dependencies into vendor/ directory.
     */
    async vendor(dir) {
        return this.install(dir, { vendor: true });
    }
    copyDirClean(src, dest) {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name === "node_modules" ||
                entry.name === ".git" ||
                entry.name === "target" ||
                entry.name === ".hkd" ||
                entry.name.endsWith(".hkdpack")) {
                continue;
            }
            const s = path.join(src, entry.name);
            const d = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this.copyDirClean(s, d);
            }
            else {
                fs.copyFileSync(s, d);
            }
        }
    }
}
exports.PackageManager2 = PackageManager2;
//# sourceMappingURL=manager.js.map