import { describe, it, expect } from "@jest/globals";
import { isSensitiveKey, maskValue, loadEffectiveConfig, formatConfigReport } from "../../src/deploy/env-config.js";

describe("Phase 14H — Environment Configuration & Secret Masking", () => {
  it("detects sensitive tokens in keys", () => {
    expect(isSensitiveKey("API_KEY")).toBe(true);
    expect(isSensitiveKey("database_password")).toBe(true);
    expect(isSensitiveKey("AUTH_TOKEN")).toBe(true);
    expect(isSensitiveKey("client_secret")).toBe(true);
    expect(isSensitiveKey("user_credential")).toBe(true);
    expect(isSensitiveKey("port")).toBe(false);
    expect(isSensitiveKey("logLevel")).toBe(false);
  });

  it("masks sensitive values while preserving non-sensitive values", () => {
    expect(maskValue("api_key", "secret12345")).toBe("********");
    expect(maskValue("jwt_token", "eyJhbGciOi...")).toBe("********");
    expect(maskValue("port", 8080)).toBe("8080");
    expect(maskValue("host", "127.0.0.1")).toBe("127.0.0.1");
  });

  it("applies environment variable precedence", () => {
    const mockEnv: Record<string, string> = {
      HKD_ENV: "staging",
      PORT: "9000",
      HKD_LOG_LEVEL: "warn",
      HKD_MAX_CONNECTIONS: "5000",
      HKD_CONFIG_DATABASE_URL: "postgres://user:pass@localhost/db",
    };

    const cfg = loadEffectiveConfig({ envSource: mockEnv });
    expect(cfg.env).toBe("staging");
    expect(cfg.port).toBe(9000);
    expect(cfg.logLevel).toBe("warn");
    expect(cfg.maxConnections).toBe(5000);
    expect(cfg.database_url).toBe("postgres://user:pass@localhost/db");
  });

  it("applies CLI overrides over environment variables", () => {
    const mockEnv = { PORT: "9000" };
    const cfg = loadEffectiveConfig({
      envSource: mockEnv,
      cliOverrides: { port: 3000, env: "production" },
    });
    expect(cfg.port).toBe(3000);
    expect(cfg.env).toBe("production");
  });

  it("formats configuration report with masked secrets", () => {
    const cfg = {
      port: 8080,
      jwt_secret: "super-secret-key",
      api_token: "tok_123",
    };
    const report = formatConfigReport(cfg);
    expect(report).toContain("8080");
    expect(report).toContain("********");
    expect(report).not.toContain("super-secret-key");
    expect(report).not.toContain("tok_123");
  });
});
