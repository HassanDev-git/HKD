/**
 * HKD Production Structured Logger
 *
 * Emits structured JSON or human-readable logs with automatic secret redaction.
 */

import { isSensitiveKey } from "./env-config.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

const LOG_LEVEL_SEVERITY: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

export interface LogRecord {
  level: LogLevel;
  message: string;
  timestamp: string;
  module?: string;
  [key: string]: any;
}

export class ProductionLogger {
  private minSeverity: number;
  private isJson: boolean;
  private records: LogRecord[] = [];
  public captureMemory = false;

  constructor(minLevel: LogLevel = "info", isJson = true) {
    this.minSeverity = LOG_LEVEL_SEVERITY[minLevel] || 30;
    this.isJson = isJson;
  }

  public setLevel(level: LogLevel): void {
    this.minSeverity = LOG_LEVEL_SEVERITY[level] || 30;
  }

  public setJson(json: boolean): void {
    this.isJson = json;
  }

  public getRecords(): LogRecord[] {
    return this.records;
  }

  public clearRecords(): void {
    this.records = [];
  }

  public log(level: LogLevel, message: string, meta: Record<string, any> = {}): LogRecord | null {
    const severity = LOG_LEVEL_SEVERITY[level];
    if (severity < this.minSeverity) return null;

    // Sanitize metadata
    const sanitizedMeta: Record<string, any> = {};
    for (const [k, v] of Object.entries(meta)) {
      if (isSensitiveKey(k)) {
        sanitizedMeta[k] = "********";
      } else {
        sanitizedMeta[k] = v;
      }
    }

    const record: LogRecord = {
      level,
      message,
      timestamp: new Date().toISOString(),
      ...sanitizedMeta,
    };

    if (this.captureMemory) {
      this.records.push(record);
    }

    if (this.isJson) {
      console.log(JSON.stringify(record));
    } else {
      const mod = record.module ? `[${record.module}] ` : "";
      console.log(`[${record.timestamp}] ${record.level.toUpperCase()} ${mod}${record.message}`);
    }

    return record;
  }

  public trace(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("trace", msg, meta);
  }

  public debug(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("debug", msg, meta);
  }

  public info(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("info", msg, meta);
  }

  public warn(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("warn", msg, meta);
  }

  public error(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("error", msg, meta);
  }

  public fatal(msg: string, meta?: Record<string, any>): LogRecord | null {
    return this.log("fatal", msg, meta);
  }
}
