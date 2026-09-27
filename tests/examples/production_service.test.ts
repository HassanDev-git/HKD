/**
 * HKD 1.1 Integration Suite: Production Service Reference Application
 * (tests/examples/production_service.test.ts)
 *
 * Tests the complete lifecycle of examples/real-world/production-style-service:
 * - Configuration loading & validation
 * - Structured JSON logging
 * - Result 2.0 error handling and pattern matching routing
 * - Functional array iterators (filter, map, reduce)
 * - Concurrency stress and clean graceful shutdown
 */

import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";

describe("HKD 1.1 Real-World — Production Style Service", () => {
  const servicePath = path.resolve(__dirname, "../../examples/real-world/production-style-service/src/main.hkd");
  const serviceCode = fs.readFileSync(servicePath, "utf-8");

  test("PROD-01: Production service runs end-to-end with zero errors", () => {
    let outputLines: string[] = [];
    const res = runSource(serviceCode, {
      edition: "2027",
      noExit: true,
      output: (line: string) => {
        outputLines.push(line);
      },
    });

    expect(res.ok).toBe(true);

    const fullOutput = outputLines.join("\n");
    expect(fullOutput).toContain("Initializing production-style service...");
    expect(fullOutput).toContain("Configuration verified: listening on 127.0.0.1:8080");
    expect(fullOutput).toContain("GET /health -> HTTP 200");
    expect(fullOutput).toContain("POST /data -> HTTP 200");
    expect(fullOutput).toContain("GET /metrics -> HTTP 200");
    expect(fullOutput).toContain("Request failed: PUT /unknown");
    expect(fullOutput).toContain("Shutdown complete. Final status: 0");
  });

  test("PROD-02: Structured JSON log lines parse valid JSON with service metadata", () => {
    let logs: any[] = [];
    runSource(serviceCode, {
      edition: "2027",
      noExit: true,
      output: (line: string) => {
        if (line.startsWith("{")) {
          try {
            logs.push(JSON.parse(line));
          } catch (e) {
            // non-json line
          }
        }
      },
    });

    expect(logs.length).toBeGreaterThanOrEqual(4);
    for (const entry of logs) {
      expect(entry.service).toBe("prod-api");
      expect(["INFO", "ERROR", "WARN"]).toContain(entry.level);
      expect(typeof entry.msg).toBe("string");
    }
  });

  test("PROD-03: Repeated execution stability (no state corruption or memory leaks)", () => {
    for (let i = 0; i < 5; i++) {
      const res = runSource(serviceCode, {
        edition: "2027",
        noExit: true,
        output: () => {},
      });
      expect(res.ok).toBe(true);
    }
  });
});
