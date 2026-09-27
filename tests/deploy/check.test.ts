import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runDeployCheck, printDeployCheckReport } from "../../src/deploy/check.js";
import { getRuntimeInfo } from "../../src/deploy/runtime-info.js";

describe("Phase 14AD & 14AA — Pre-Flight Checklist & Observability Diagnostics", () => {
  const tempDir = path.join(os.tmpdir(), `hkd-check-test-${Date.now()}`);

  beforeAll(() => {
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "hkd.toml"), 'name = "prod-app"\nversion = "1.0.0"\nmain = "src/main.hkd"\n');
    fs.writeFileSync(path.join(tempDir, "src", "main.hkd"), 'println("hello production")\n');
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("passes all checks on a valid project directory", () => {
    const report = runDeployCheck(tempDir, "x86_64-windows", "release");
    expect(report.allOk).toBe(true);
    expect(report.target).toBe("x86_64-windows");
    expect(report.profile).toBe("release");

    const manifestItem = report.items.find((i) => i.name.includes("Manifest"));
    expect(manifestItem?.status).toBe("ok");

    const entryItem = report.items.find((i) => i.name.includes("Entrypoint"));
    expect(entryItem?.status).toBe("ok");
  });

  it("detects missing entrypoint and reports error", () => {
    const emptyDir = path.join(tempDir, "empty");
    fs.mkdirSync(emptyDir, { recursive: true });

    const report = runDeployCheck(emptyDir, "x86_64-linux", "speed");
    expect(report.allOk).toBe(false);
    const entryItem = report.items.find((i) => i.name.includes("Entrypoint"));
    expect(entryItem?.status).toBe("error");
  });

  it("queries production runtime observability metrics", () => {
    const info = getRuntimeInfo();
    expect(info.version).toBeDefined();
    expect(info.platform).toBeDefined();
    expect(info.arch).toBeDefined();
    expect(info.memory.rssMb).toBeGreaterThan(0);
    expect(info.supportedTiers.length).toBeGreaterThanOrEqual(4);
    expect(info.activeLimits.maxConnections).toBe(10000);
  });
});
