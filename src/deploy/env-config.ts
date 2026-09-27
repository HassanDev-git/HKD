/**
 * HKD Configuration & Secret Redaction Engine
 *
 * Implements deterministic configuration precedence:
 * Defaults -> Config file -> Environment variables -> CLI overrides
 * Automatically masks sensitive tokens in diagnostics and logs.
 */

import * as fs from "fs";
import * as path from "path";
import { readManifest } from "../package-manager/index.js";

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

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
}

export function maskValue(key: string, value: any): string {
  if (value === undefined || value === null) return "<unset>";
  const str = String(value);
  if (isSensitiveKey(key)) {
    return "********";
  }
  return str;
}

export interface ConfigOptions {
  projectDir?: string;
  cliOverrides?: Record<string, any>;
  envSource?: Record<string, string | undefined>;
}

export function loadEffectiveConfig(options: ConfigOptions = {}): Record<string, any> {
  const result: Record<string, any> = {
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
    const manifest = readManifest(options.projectDir);
    if (manifest && (manifest as any).deploy) {
      Object.assign(result, (manifest as any).deploy);
    }

    const envToml = path.join(options.projectDir, "hkd.env.json");
    if (fs.existsSync(envToml)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(envToml, "utf-8"));
        Object.assign(result, parsed);
      } catch {}
    }
  }

  // 2. Load from Environment variables (HKD_* and standard port/host)
  const env = options.envSource || process.env;

  if (env.HKD_ENV) result.env = env.HKD_ENV;
  if (env.PORT) result.port = parseInt(env.PORT, 10);
  if (env.HOST) result.host = env.HOST;
  if (env.HKD_LOG_LEVEL) result.logLevel = env.HKD_LOG_LEVEL;
  if (env.HKD_MAX_CONNECTIONS) result.maxConnections = parseInt(env.HKD_MAX_CONNECTIONS, 10);

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

export function formatConfigReport(cfg: Record<string, any>): string {
  const lines: string[] = [
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
