/**
 * HKD Production Structured Logger
 *
 * Emits structured JSON or human-readable logs with automatic secret redaction.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";
export interface LogRecord {
    level: LogLevel;
    message: string;
    timestamp: string;
    module?: string;
    [key: string]: any;
}
export declare class ProductionLogger {
    private minSeverity;
    private isJson;
    private records;
    captureMemory: boolean;
    constructor(minLevel?: LogLevel, isJson?: boolean);
    setLevel(level: LogLevel): void;
    setJson(json: boolean): void;
    getRecords(): LogRecord[];
    clearRecords(): void;
    log(level: LogLevel, message: string, meta?: Record<string, any>): LogRecord | null;
    trace(msg: string, meta?: Record<string, any>): LogRecord | null;
    debug(msg: string, meta?: Record<string, any>): LogRecord | null;
    info(msg: string, meta?: Record<string, any>): LogRecord | null;
    warn(msg: string, meta?: Record<string, any>): LogRecord | null;
    error(msg: string, meta?: Record<string, any>): LogRecord | null;
    fatal(msg: string, meta?: Record<string, any>): LogRecord | null;
}
//# sourceMappingURL=logging.d.ts.map