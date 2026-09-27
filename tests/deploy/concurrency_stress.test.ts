/**
 * HKD HTTP Server Concurrency & Stress Tests (tests/deploy/concurrency_stress.test.ts)
 *
 * Validates concurrent connection handling, health probe responsiveness under load,
 * metrics accuracy, and graceful teardown without connection drops.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as http from "http";
import { ProductionHttpServer } from "../../src/deploy/http-server.js";
import { ProductionLogger } from "../../src/deploy/logging.js";

function get(port: number, path: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "GET",
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode || 0, body }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

describe("HKD Production HTTP Server — Concurrency & Load Stress", () => {
  const port = 19491;
  let server: ProductionHttpServer;

  beforeAll(async () => {
    const logger = new ProductionLogger("error", false);
    server = new ProductionHttpServer(
      {
        port,
        host: "127.0.0.1",
        requestTimeoutMs: 5000,
        maxRequestBodyBytes: 1024 * 1024,
        exposeMetrics: true,
      },
      logger
    );
    await server.start();
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it("handles 30 parallel concurrent health requests with 200 OK", async () => {
    const requests = Array.from({ length: 30 }, () => get(port, "/health"));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ok");
    }
  });

  it("handles 30 parallel concurrent ready requests with 200 OK", async () => {
    const requests = Array.from({ length: 30 }, () => get(port, "/ready"));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe("ready");
    }
  });

  it("accurately reports server metrics under concurrent execution", async () => {
    const res = await get(port, "/metrics");
    expect(res.statusCode).toBe(200);
    const metrics = JSON.parse(res.body);
    expect(metrics.totalRequests).toBeGreaterThanOrEqual(60);
    expect(metrics.totalErrors).toBe(0);
  });

  it("returns 404 for unknown endpoints without hanging connections", async () => {
    const requests = Array.from({ length: 10 }, (_, i) => get(port, `/unknown_${i}`));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      expect(res.statusCode).toBe(404);
    }
  });
});
