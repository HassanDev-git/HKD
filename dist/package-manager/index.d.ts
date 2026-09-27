/**
 * HKD Package Manager
 *
 * Handles:
 *   - hkd.toml manifest parsing/writing
 *   - Local dependency resolution
 *   - Package cache (~/.hkd/packages/)
 *   - Version constraint checking (semver)
 *   - Pack/Unpack .hkdpack archives
 *   - Lockfile hkd.lock serialization/deserialization
 *
 * Offline-first, registry-ready package architecture.
 */
import { LanguageEdition } from "../utils/index.js";
export interface HkdManifest {
    name: string;
    version: string;
    edition?: string;
    description?: string;
    author?: string;
    license?: string;
    main?: string;
    dependencies: Record<string, string | {
        path: string;
    }>;
    devDependencies: Record<string, string | {
        path: string;
    }>;
}
export interface ResolvedDep {
    name: string;
    version: string;
    source: {
        path: string;
    } | {
        checksum: string;
    } | {
        cached: boolean;
    };
    dependencies: Record<string, string>;
}
export declare function parseToml(content: string): Record<string, any>;
export declare function stringifyToml(manifest: HkdManifest): string;
export declare function readManifest(dir: string): HkdManifest | null;
export declare function writeManifest(dir: string, manifest: HkdManifest): void;
export declare function packPackage(dir: string): Buffer;
export declare function unpackPackage(archiveBuf: Buffer, targetDir: string): HkdManifest;
export declare function copyDirSync(src: string, dest: string): void;
export interface PackageManagerResult {
    ok: boolean;
    message: string;
}
export declare class PackageManager {
    cacheDir: string;
    constructor();
    init(dir: string, name: string, template?: string, edition?: LanguageEdition): PackageManagerResult;
    /** hkd pack — pack project to .hkdpack */
    pack(dir: string): string;
    /** hkd add <package> [version] */
    add(dir: string, pkgNameOrPath: string, version?: string): PackageManagerResult;
    /** hkd remove <package> */
    remove(dir: string, pkgName: string): PackageManagerResult;
    /** hkd install — resolve and download all dependencies */
    install(dir: string): PackageManagerResult;
    /** hkd update — update lockfile and dependencies */
    update(dir: string): PackageManagerResult;
    /** Resolve a package to its directory */
    resolve(fromDir: string, name: string): string | null;
}
export declare function resolveDependencies(dir: string, manifest: HkdManifest, cacheDir: string, activeResolutions?: Set<string>): Record<string, ResolvedDep>;
//# sourceMappingURL=index.d.ts.map