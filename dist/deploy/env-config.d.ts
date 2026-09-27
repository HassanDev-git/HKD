/**
 * HKD Configuration & Secret Redaction Engine
 *
 * Implements deterministic configuration precedence:
 * Defaults -> Config file -> Environment variables -> CLI overrides
 * Automatically masks sensitive tokens in diagnostics and logs.
 */
export declare function isSensitiveKey(key: string): boolean;
export declare function maskValue(key: string, value: any): string;
export interface ConfigOptions {
    projectDir?: string;
    cliOverrides?: Record<string, any>;
    envSource?: Record<string, string | undefined>;
}
export declare function loadEffectiveConfig(options?: ConfigOptions): Record<string, any>;
export declare function formatConfigReport(cfg: Record<string, any>): string;
//# sourceMappingURL=env-config.d.ts.map