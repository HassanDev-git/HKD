/**
 * HKD Release & Distribution Orchestrator
 *
 * Coordinates compilation, testing, metadata generation, checksumming,
 * SBOM generation, and release bundle packaging.
 */
import { ReleaseArtifactMetadata } from "./artifact.js";
export interface ReleaseOptions {
    projectDir: string;
    target?: string;
    profile?: string;
    outDir?: string;
    skipTests?: boolean;
}
export interface ReleaseResult {
    ok: boolean;
    message: string;
    bundleDir?: string;
    archivePath?: string;
    metadata?: ReleaseArtifactMetadata;
}
export declare function buildReleaseBundle(compiledBinaryPath: string, options: ReleaseOptions): ReleaseResult;
//# sourceMappingURL=release.d.ts.map