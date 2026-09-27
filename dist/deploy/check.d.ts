/**
 * HKD Pre-Flight Deployment Checklist & Dry-Run Inspector
 *
 * Validates compiler, target, lockfile, healthcheck endpoints, and security boundaries.
 */
export interface DeployCheckItem {
    name: string;
    status: "ok" | "warn" | "error";
    message: string;
}
export interface DeployCheckReport {
    allOk: boolean;
    target: string;
    profile: string;
    items: DeployCheckItem[];
}
export declare function runDeployCheck(projectDir: string, targetStr?: string, profileStr?: string): DeployCheckReport;
export declare function printDeployCheckReport(report: DeployCheckReport, asJson?: boolean): void;
export declare function runDeployDryRun(projectDir: string, targetStr?: string, profileStr?: string): void;
//# sourceMappingURL=check.d.ts.map