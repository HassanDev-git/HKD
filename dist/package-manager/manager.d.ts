/**
 * HKD Package Manager 2.0
 *
 * Unified orchestrator for all package commands: add, remove, install, update,
 * pack, publish, search, info, vendor, and cache management.
 */
import { ContentAddressedCache } from "./cache.js";
import { LockfileV2 } from "./lockfile.js";
import { RegistryClient } from "./registry/registry-client.js";
import { LanguageEdition } from "../utils/index.js";
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
export declare class PackageManager2 {
    cache: ContentAddressedCache;
    registry: RegistryClient;
    constructor(options?: {
        cacheDir?: string;
        registry?: RegistryClient;
    });
    /**
     * Initializes a new HKD project.
     */
    init(dir: string, name: string, template?: string, edition?: LanguageEdition): PackageManagerResult;
    /**
     * Builds the PackageMetadataProvider bridging local cache, path dependencies, and registry.
     */
    private createProvider;
    /**
     * Installs all dependencies declared in hkd.toml / hkd.lock.
     */
    install(dir: string, options?: InstallOptions): Promise<PackageManagerResult>;
    /**
     * Adds a new dependency and runs installation.
     * Supports:
     * - Registry package: `hkd add http@^1.0.0` or `hkd add http`
     * - Local path: `hkd add ../my-lib` or `hkd add my-lib --path ../my-lib`
     * - Archive: `hkd add ./vendor/my-pkg.hkdpack`
     */
    add(dir: string, pkgSpec: string, options?: InstallOptions): Promise<PackageManagerResult>;
    /**
     * Removes a dependency and prunes tree.
     */
    remove(dir: string, rawName: string, options?: InstallOptions): Promise<PackageManagerResult>;
    /**
     * Updates dependencies within version ranges.
     * If pkgName is specified, only that dependency is re-resolved.
     * Otherwise, all dependencies are re-resolved.
     */
    update(dir: string, pkgName?: string, options?: InstallOptions): Promise<PackageManagerResult>;
    /**
     * Packs directory into deterministic .hkdpack archive.
     */
    pack(dir: string): {
        path: string;
        checksum: string;
    };
    /**
     * Publishes package to registry.
     */
    publish(dir: string, token?: string): Promise<PackageManagerResult>;
    /**
     * Searches registry.
     */
    search(query: string, limit?: number): Promise<import("./registry/registry-client.js").SearchResult[]>;
    /**
     * Queries package info.
     */
    info(pkgName: string): Promise<import("./registry/registry-client.js").PackageMetadata | null>;
    /**
     * Vendors all dependencies into vendor/ directory.
     */
    vendor(dir: string): Promise<PackageManagerResult>;
    private copyDirClean;
}
//# sourceMappingURL=manager.d.ts.map