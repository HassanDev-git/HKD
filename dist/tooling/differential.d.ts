/**
 * HKD Cross-Runtime Differential Validation Engine
 *
 * Executes programs across execution tiers:
 * Tier 0 (Stack VM / Reference), Tier 1 (Native Zig), Tier 2 (Optimizing JIT)
 * Compares stdout, stderr, exit code, and return values for bitwise equivalence.
 */
export interface DifferentialResult {
    programName: string;
    source: string;
    vmOutput: string;
    vmStatus: number;
    nativeOutput?: string;
    nativeStatus?: number;
    equivalent: boolean;
    notes?: string;
}
export interface DifferentialReport {
    timestamp: string;
    totalTested: number;
    totalEquivalent: number;
    allEquivalent: boolean;
    results: DifferentialResult[];
}
export declare function runDifferentialProgram(source: string, name: string): DifferentialResult;
export declare function runDifferentialSuite(programs: Array<{
    name: string;
    source: string;
}>): DifferentialReport;
//# sourceMappingURL=differential.d.ts.map