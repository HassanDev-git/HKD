/**
 * HKD Tooling Doctor 2.0 (hkd doctor)
 *
 * Comprehensive diagnostics: compiler, native runtime, JIT/AOT readiness,
 * target architectures, LSP/DAP servers, package cache, containerization, and environment.
 */
export interface DoctorCheck {
    name: string;
    category: "compiler" | "runtime" | "lsp" | "debugger" | "package" | "vscode" | "target" | "container" | "deploy" | "security";
    status: "ok" | "warn" | "error";
    message: string;
    details?: string;
}
export interface DoctorReport {
    version: string;
    platform: string;
    arch: string;
    allOk: boolean;
    checks: DoctorCheck[];
}
export declare function runDoctor(): DoctorReport;
export declare function printDoctorReport(report: DoctorReport, asJson?: boolean): void;
//# sourceMappingURL=doctor.d.ts.map