/**
 * HKD Automated Patch Release Pipeline
 *
 * Implements automated validation and packaging for 1.0.x patch releases:
 * - SemVer 1.0.x patch enforcement
 * - CHANGELOG.md verification
 * - Package manifest consistency
 * - SBOM generation and artifact digest creation
 * - Safe pre-release dry-run capabilities
 */
export interface PatchReleaseOptions {
    version: string;
    projectDir?: string;
    dryRun?: boolean;
}
export interface PatchReleaseStep {
    name: string;
    status: "PASS" | "FAIL" | "SKIPPED";
    details: string;
}
export interface PatchReleaseReport {
    ok: boolean;
    version: string;
    previousVersion: string;
    isPatch: boolean;
    changelogVerified: boolean;
    manifestUpdated: boolean;
    sbomGenerated: boolean;
    errors: string[];
    steps: PatchReleaseStep[];
}
export declare function runPatchReleasePipeline(options: PatchReleaseOptions): PatchReleaseReport;
//# sourceMappingURL=patch-release.d.ts.map