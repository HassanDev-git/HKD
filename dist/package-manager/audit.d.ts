/**
 * HKD Package Security Auditor
 *
 * Scans project manifests, lockfiles, and installed dependencies for
 * integrity failures, checksum mismatches, untrusted sources, and dependency conflicts.
 */
export type AuditSeverity = "low" | "medium" | "high" | "critical";
export interface AuditIssue {
    code: string;
    severity: AuditSeverity;
    package: string;
    message: string;
    recommendation: string;
}
export interface AuditResult {
    ok: boolean;
    scannedPackages: number;
    issues: AuditIssue[];
}
/**
 * Audits a project directory for package security issues.
 */
export declare function auditProject(projectDir: string): AuditResult;
//# sourceMappingURL=audit.d.ts.map