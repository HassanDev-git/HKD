"use strict";
/**
 * HKD Configuration & Secret Redaction Engine
 *
 * Implements deterministic configuration precedence:
 * Defaults -> Config file -> Environment variables -> CLI overrides
 * Automatically masks sensitive tokens in diagnostics and logs.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSensitiveKey = isSensitiveKey;
exports.maskValue = maskValue;
exports.loadEffectiveConfig = loadEffectiveConfig;
exports.formatConfigReport = formatConfigReport;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_js_1 = require("../package-manager/index.js");
const SENSITIVE_KEY_PATTERNS = [
    /password/i,
    /secret/i,
    /token/i,
    /auth/i,
    /key/i,
    /credential/i,
    /passwd/i,
    /private/i,
];
function isSensitiveKey(key) {
    return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}
function maskValue(key, value) {
    if (value === undefined || value === null)
        return "<unset>";
    const str = String(value);
    if (isSensitiveKey(key)) {
        return "********";
    }
    return str;
}
function loadEffectiveConfig(options = {}) {
    const result = {
        env: "development",
        host: "127.0.0.1",
        port: 8080,
        logLevel: "info",
        maxConnections: 10000,
        requestTimeoutMs: 30000,
        keepAliveTimeoutMs: 5000,
        maxRequestBodyBytes: 10 * 1024 * 1024,
    };
    // 1. Load from project manifest or hkd.toml
    if (options.projectDir) {
        const manifest = (0, index_js_1.readManifest)(options.projectDir);
        if (manifest && manifest.deploy) {
            Object.assign(result, manifest.deploy);
        }
        const envToml = path.join(options.projectDir, "hkd.env.json");
        if (fs.existsSync(envToml)) {
            try {
                const parsed = JSON.parse(fs.readFileSync(envToml, "utf-8"));
                Object.assign(result, parsed);
            }
            catch { }
        }
    }
    // 2. Load from Environment variables (HKD_* and standard port/host)
    const env = options.envSource || process.env;
    if (env.HKD_ENV)
        result.env = env.HKD_ENV;
    if (env.PORT)
        result.port = parseInt(env.PORT, 10);
    if (env.HOST)
        result.host = env.HOST;
    if (env.HKD_LOG_LEVEL)
        result.logLevel = env.HKD_LOG_LEVEL;
    if (env.HKD_MAX_CONNECTIONS)
        result.maxConnections = parseInt(env.HKD_MAX_CONNECTIONS, 10);
    for (const [k, v] of Object.entries(env)) {
        if (k.startsWith("HKD_CONFIG_") && v !== undefined) {
            const configKey = k.slice("HKD_CONFIG_".length).toLowerCase();
            result[configKey] = v;
        }
    }
    // 3. CLI Overrides
    if (options.cliOverrides) {
        Object.assign(result, options.cliOverrides);
    }
    return result;
}
function formatConfigReport(cfg) {
    const lines = [
        "HKD Effective Configuration:\n",
        "  Key                     Value",
        "  ──────────────────────  ───────────────────────────────",
    ];
    for (const [k, v] of Object.entries(cfg)) {
        const displayVal = maskValue(k, v);
        lines.push(`  ${k.padEnd(22)}  ${displayVal}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=env-config.js.map