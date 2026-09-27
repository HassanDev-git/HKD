/**
 * HKD Release Artifact & Integrity Engine
 *
 * Models release artifacts, computes cryptographic SHA-256 digests,
 * generates artifact.json manifests, and verifies artifact integrity.
 */
import { TargetTriple } from "./targets.js";
import { BuildProfile } from "./profiles.js";
export interface ReleaseArtifactMetadata {
    name: string;
    version: string;
    target: string;
    architecture: string;
    os: string;
    compilerVersion: string;
    runtimeVersion: string;
    buildProfile: string;
    checksum: string;
    sizeBytes: number;
    buildTimestamp: string;
    binaryName: string;
    files?: Record<string, string>;
}
export declare function computeSha256(filePath: string): string;
export declare function generateArtifactMetadata(binaryPath: string, pkgName: string, pkgVersion: string, target: TargetTriple, profile: BuildProfile): ReleaseArtifactMetadata;
export declare function writeArtifactMetadata(outDir: string, meta: ReleaseArtifactMetadata): string;
export declare function generateSha256Sums(dir: string, fileNames: string[]): string;
export interface VerificationResult {
    valid: boolean;
    errors: string[];
    metadata?: ReleaseArtifactMetadata;
    actualSha256?: string;
}
export declare function verifyArtifact(targetPath: string): VerificationResult;
//# sourceMappingURL=artifact.d.ts.map