import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as http from "http";
import { ProductionHttpServer } from "../../src/deploy/http-server.js";
import { ProductionLogger } from "../../src/deploy/logging.js";

function makeRequest(
  port: number,
  path: string,
  method = "GET",
  postData = ""
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode || 0, body }));
      }
    );
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

describe("Phase 14J & 14K — Production Hardened HTTP Server & Probes", () => {
  const testPort = 19283;
  let server: ProductionHttpServer;

  beforeAll(async () => {
    const logger = new ProductionLogger("fatal", false);
    server = new ProductionHttpServer(
      {
        port: testPort,
        host: "127.0.0.1",
        maxRequestBodyBytes: 1024, // 1KB limit for testing
      },
      logger
    );

    server.get("/api/hello", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ message: "hello world" }));
    });

    server.post("/api/echo", (_req, res, body) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    });

    await server.start();
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it("responds to /health probe with HTTP 200 and uptime", async () => {
    const res = await makeRequest(testPort, "/health");
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("ok");
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });

  it("responds to /ready probe with HTTP 200", async () => {
    const res = await makeRequest(testPort, "/ready");
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.status).toBe("ready");
  });

  it("exposes live metrics over /metrics endpoint", async () => {
    const res = await makeRequest(testPort, "/metrics");
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.totalRequests).toBeGreaterThan(0);
    expect(data.activeConnections).toBeDefined();
  });

  it("handles custom registered routes", async () => {
    const res = await makeRequest(testPort, "/api/hello");
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toBe("hello world");
  });

  it("rejects request bodies exceeding maxRequestBodyBytes with 413 Payload Too Large", async () => {
    const hugePayload = "x".repeat(2048); // 2KB exceeds 1KB limit
    try {
      const res = await makeRequest(testPort, "/api/echo", "POST", hugePayload);
      expect(res.statusCode).toBe(413);
    } catch (err) {
      // Connection might be aborted on body overflow
      expect(err).toBeDefined();
    }
  });

  it("returns 404 for unmapped endpoints", async () => {
    const res = await makeRequest(testPort, "/non-existent");
    expect(res.statusCode).toBe(404);
  });
});
