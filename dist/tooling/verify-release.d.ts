/**
 * HKD Automated Release Acceptance Verifier (hkd verify-release)
 *
 * Runs comprehensive 18-dimension evidence-based acceptance gates covering
 * compiler, native runtime, differential execution, memory instrumentation,
 * security, packaging, LSP, DAP, VS Code, reproducibility, and documentation.
 * Generates artifacts/release-verification.json.
 */
export type GateSeverity = "critical" | "high" | "medium" | "informational";
export type GateStatus = "PASS" | "FAIL" | "WARN" | "EXPECTED";
export interface ReleaseDimensionStatus {
    dimension: string;
    category: string;
    status: "PASS" | "WARN — non-blocking" | "BLOCKER";
    message: string;
    details?: string;
}
export interface ReleaseGateResult {
    name: string;
    status: "PASS" | "WARN" | "FAIL";
    message: string;
}
export interface ReleaseGateEvidence {
    name: string;
    status: GateStatus;
    severity: GateSeverity;
    command: string;
    duration_ms: number;
    evidence: Record<string, any>;
}
export interface ExperimentalFeatureResult {
    name: string;
    status: "EXPECTED";
    rfc: string;
    targetEdition: string;
    roadmap: string;
}
export interface VerifyReleaseReport {
    allPassed: boolean;
    version: string;
    edition: string;
    target: string;
    timestamp: string;
    totalDimensions: number;
    passedDimensions: number;
    warningsCount: number;
    blockersCount: number;
    dimensions: ReleaseDimensionStatus[];
    gates: ReleaseGateResult[];
    verificationGates: ReleaseGateEvidence[];
    experimentalFeatures: ExperimentalFeatureResult[];
    result: "RELEASE READY" | "NOT RELEASE READY";
}
export declare function runVerifyRelease(projectDir: string): VerifyReleaseReport;
export declare function printVerifyReleaseReport(report: VerifyReleaseReport, asJson?: boolean): void;
//# sourceMappingURL=verify-release.d.ts.map