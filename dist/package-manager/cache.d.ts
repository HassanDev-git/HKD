/**
 * HKD Content-Addressed Cache
 *
 * Implements multi-tier content-addressed storage for packages, metadata, and native
 * binaries. Guarantees atomic concurrent writes, integrity verification, and cache pruning.
 */
import { HkdManifest } from "./index.js";
export interface CacheEntry {
    name: string;
    version: string;
    checksum: string;
    sizeBytes: number;
    cachedAt: string;
}
export declare class ContentAddressedCache {
    baseDir: string;
    packagesDir: string;
    metadataDir: string;
    nativeDir: string;
    constructor(customBaseDir?: string);
    private ensureDirs;
    private normalizeChecksum;
    /**
     * Stores a package in content-addressed cache atomically.
     */
    store(checksum: string, archiveBuf: Buffer, manifest: HkdManifest): string;
    /**
     * Retrieves an unpacked package from cache if present.
     */
    get(checksum: string): {
        dir: string;
        archivePath: string;
        manifest: HkdManifest;
    } | null;
    /**
     * Checks whether a package is present and uncorrupted in the cache.
     */
    has(checksum: string): boolean;
    /**
     * Lists all cached packages.
     */
    list(): CacheEntry[];
    /**
     * Cleans all cached packages, freeing disk space.
     */
    clean(): {
        count: number;
        bytesFreed: number;
    };
    /**
     * Verifies the cryptographic integrity of all cached packages.
     */
    verify(): {
        valid: boolean;
        corrupted: string[];
    };
}
//# sourceMappingURL=cache.d.ts.map