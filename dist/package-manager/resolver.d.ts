/**
 * HKD Dependency Resolver 2.0
 *
 * Implements deterministic transitive dependency resolution using a multi-pass
 * constraint-satisfaction algorithm with cycle detection, conflict reporting,
 * and lockfile replay.
 */
import { HkdManifest } from "./index.js";
import { LockfileV2 } from "./lockfile.js";
export interface PackageMetadataProvider {
    getAvailableVersions(pkgName: string): string[];
    getPackageManifest(pkgName: string, version: string): HkdManifest | null;
    getPackageIntegrity(pkgName: string, version: string): string;
}
export interface ResolutionOptions {
    existingLockfile?: LockfileV2 | null;
    provider: PackageMetadataProvider;
    offline?: boolean;
}
export interface ResolvedPackageNode {
    name: string;
    version: string;
    source: string;
    checksum: string;
    dependencies: Record<string, string>;
}
export interface ResolutionResult {
    packages: Record<string, ResolvedPackageNode>;
    lockfile: LockfileV2;
}
/**
 * Resolves all direct and transitive dependencies deterministically.
 */
export declare function resolveDependencyGraph(rootManifest: HkdManifest, options: ResolutionOptions): ResolutionResult;
//# sourceMappingURL=resolver.d.ts.map