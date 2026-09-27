/**
 * HKD Reproducible Builds Diagnostic
 *
 * Implements clean dual-build verification to mathematically prove artifact
 * bit-for-bit equivalence and detect nondeterministic build sources.
 */
export interface ReproducibilityResult {
    reproducible: boolean;
    hashA: string;
    hashB: string;
    fileSizeBytes: number;
    message: string;
}
/**
 * Builds the target file twice into isolated temporary outputs and compares SHA-256 hashes.
 */
export declare function verifyBuildReproducibility(sourceFile: string, cliPath: string): ReproducibilityResult;
//# sourceMappingURL=reproducible.d.ts.map