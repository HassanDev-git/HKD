"use strict";
/**
 * HKD Production Structured Logger
 *
 * Emits structured JSON or human-readable logs with automatic secret redaction.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProductionLogger = void 0;
const env_config_js_1 = require("./env-config.js");
const LOG_LEVEL_SEVERITY = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};
class ProductionLogger {
    minSeverity;
    isJson;
    records = [];
    captureMemory = false;
    constructor(minLevel = "info", isJson = true) {
        this.minSeverity = LOG_LEVEL_SEVERITY[minLevel] || 30;
        this.isJson = isJson;
    }
    setLevel(level) {
        this.minSeverity = LOG_LEVEL_SEVERITY[level] || 30;
    }
    setJson(json) {
        this.isJson = json;
    }
    getRecords() {
        return this.records;
    }
    clearRecords() {
        this.records = [];
    }
    log(level, message, meta = {}) {
        const severity = LOG_LEVEL_SEVERITY[level];
        if (severity < this.minSeverity)
            return null;
        // Sanitize metadata
        const sanitizedMeta = {};
        for (const [k, v] of Object.entries(meta)) {
            if ((0, env_config_js_1.isSensitiveKey)(k)) {
                sanitizedMeta[k] = "********";
            }
            else {
                sanitizedMeta[k] = v;
            }
        }
        const record = {
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
        }
        else {
            const mod = record.module ? `[${record.module}] ` : "";
            console.log(`[${record.timestamp}] ${record.level.toUpperCase()} ${mod}${record.message}`);
        }
        return record;
    }
    trace(msg, meta) {
        return this.log("trace", msg, meta);
    }
    debug(msg, meta) {
        return this.log("debug", msg, meta);
    }
    info(msg, meta) {
        return this.log("info", msg, meta);
    }
    warn(msg, meta) {
        return this.log("warn", msg, meta);
    }
    error(msg, meta) {
        return this.log("error", msg, meta);
    }
    fatal(msg, meta) {
        return this.log("fatal", msg, meta);
    }
}
exports.ProductionLogger = ProductionLogger;
//# sourceMappingURL=logging.js.map