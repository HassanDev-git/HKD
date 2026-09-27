/**
 * HKD Production Runtime Observability & Exit Codes
 */
export declare enum ExitCode {
    Success = 0,
    RuntimeError = 1,
    UsageError = 2,
    ConfigError = 3,
    BuildError = 4,
    DeployError = 5
}
export interface RuntimeInfoReport {
    version: string;
    target: string;
    platform: string;
    arch: string;
    nodeVersion: string;
    uptimeSeconds: number;
    memory: {
        rssMb: number;
        heapUsedMb: number;
        heapTotalMb: number;
    };
    supportedTiers: string[];
    activeLimits: {
        maxConnections: number;
        maxRequestBodyMb: number;
    };
}
export declare function getRuntimeInfo(): RuntimeInfoReport;
export declare function printRuntimeInfo(report: RuntimeInfoReport, asJson?: boolean): void;
//# sourceMappingURL=runtime-info.d.ts.map