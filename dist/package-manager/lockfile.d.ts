/**
 * HKD Lockfile V2 Architecture
 *
 * Implements deterministic TOML-based lockfile format, cryptographic checksum
 * verification, source pinning, dependency graph recording, and V1 migration.
 */
export interface LockedPackage {
    name: string;
    version: string;
    source: string;
    checksum: string;
    dependencies: string[];
}
export interface LockfileV2 {
    version: 2;
    resolver: string;
    packages: LockedPackage[];
}
/**
 * Serializes a LockfileV2 structure into deterministic TOML.
 * Packages and dependencies are sorted alphabetically.
 */
export declare function serializeLockfileV2(lockfile: LockfileV2): string;
/**
 * Parses a LockfileV2 TOML string.
 */
export declare function parseLockfileV2(content: string): LockfileV2;
/**
 * Migrates a legacy V1 JSON lockfile into LockfileV2 format.
 */
export declare function migrateLockfileV1(v1Content: string): LockfileV2;
/**
 * Reads any lockfile (V1 JSON or V2 TOML) from a project directory.
 * If V1 is found, seamlessly migrates it to V2.
 */
export declare function readLockfile(projectDir: string): LockfileV2 | null;
/**
 * Writes a LockfileV2 to `hkd.lock` in the project directory.
 */
export declare function writeLockfile(projectDir: string, lockfile: LockfileV2): void;
//# sourceMappingURL=lockfile.d.ts.map