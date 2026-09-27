import { describe, it, expect } from "@jest/globals";
import { ProductionLogger } from "../../src/deploy/logging.js";

describe("Phase 14L — Production Structured Logging", () => {
  it("logs structured JSON with timestamp and level", () => {
    const logger = new ProductionLogger("debug", true);
    logger.captureMemory = true;

    const record = logger.info("Application starting", { port: 8080 });
    expect(record).not.toBeNull();
    expect(record?.level).toBe("info");
    expect(record?.message).toBe("Application starting");
    expect(record?.port).toBe(8080);
    expect(record?.timestamp).toBeDefined();
  });

  it("filters out logs below minimum severity", () => {
    const logger = new ProductionLogger("warn", true);
    logger.captureMemory = true;

    const traceRec = logger.trace("trace message");
    const debugRec = logger.debug("debug message");
    const infoRec = logger.info("info message");
    const warnRec = logger.warn("warning message");
    const errorRec = logger.error("error message");

    expect(traceRec).toBeNull();
    expect(debugRec).toBeNull();
    expect(infoRec).toBeNull();
    expect(warnRec).not.toBeNull();
    expect(errorRec).not.toBeNull();
  });

  it("automatically redacts sensitive keys in log metadata", () => {
    const logger = new ProductionLogger("info", true);
    logger.captureMemory = true;

    const record = logger.info("User logged in", {
      username: "alice",
      token: "secret_jwt_token_value",
      db_password: "super_secret_db_pass",
    });

    expect(record?.username).toBe("alice");
    expect(record?.token).toBe("********");
    expect(record?.db_password).toBe("********");
  });

  it("maintains in-memory record buffer when enabled", () => {
    const logger = new ProductionLogger("info", true);
    logger.captureMemory = true;

    logger.info("msg 1");
    logger.error("msg 2");

    expect(logger.getRecords().length).toBe(2);
    logger.clearRecords();
    expect(logger.getRecords().length).toBe(0);
  });
});
