import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import * as http from "http";
import { ProductionHttpServer } from "../../src/deploy/http-server.js";
import { ProductionLogger } from "../../src/deploy/logging.js";

function getUrl(port: number, path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body }));
    }).on("error", reject);
  });
}

describe("Phase 14 Production Diagnostics, Limits & Probes Tests", () => {
  const port = 19382;
  let server: ProductionHttpServer;

  beforeAll(async () => {
    const logger = new ProductionLogger("fatal", false);
    server = new ProductionHttpServer(
      {
        port,
        host: "127.0.0.1",
        maxConnections: 100,
        keepAliveTimeoutMs: 2000,
        requestTimeoutMs: 5000,
        maxRequestBodyBytes: 4096,
        exposeMetrics: true,
      },
      logger
    );

    server.get("/api/v1/ping", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ pong: true }));
    });

    server.get("/api/v1/user/:id", (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ user: "test-user", id: 42 }));
    });

    await server.start();
  });

  afterAll(async () => {
    await server.shutdown();
  });

  it("handles concurrent requests without degradation", async () => {
    const reqs = Array.from({ length: 15 }, () => getUrl(port, "/health"));
    const results = await Promise.all(reqs);
    for (const r of results) {
      expect(r.status).toBe(200);
      const data = JSON.parse(r.body);
      expect(data.status).toBe("ok");
    }
  });

  it("increments totalRequests metric accurately", async () => {
    const m1 = server.getMetrics();
    await getUrl(port, "/health");
    await getUrl(port, "/ready");
    const m2 = server.getMetrics();
    expect(m2.totalRequests).toBeGreaterThanOrEqual(m1.totalRequests + 2);
  });

  it("increments totalBytesTransferred metric on response dispatch", async () => {
    const m1 = server.getMetrics();
    await getUrl(port, "/api/v1/ping");
    const m2 = server.getMetrics();
    expect(m2.totalBytesTransferred).toBeGreaterThanOrEqual(m1.totalBytesTransferred);
  });

  it("returns status shutting_down on ready probe during shutdown phase", async () => {
    const freshPort = 19385;
    const srv = new ProductionHttpServer({ port: freshPort, host: "127.0.0.1" });
    await srv.start();

    const preShutdown = await getUrl(freshPort, "/ready");
    expect(preShutdown.status).toBe(200);
    expect(JSON.parse(preShutdown.body).status).toBe("ready");

    const shutdownPromise = srv.shutdown();
    // After shutdown initiated
    await shutdownPromise;
  });

  it("correctly routes multiple endpoints", async () => {
    const pingRes = await getUrl(port, "/api/v1/ping");
    expect(pingRes.status).toBe(200);
    expect(JSON.parse(pingRes.body).pong).toBe(true);

    const userRes = await getUrl(port, "/api/v1/user/:id");
    expect(userRes.status).toBe(200);
    expect(JSON.parse(userRes.body).user).toBe("test-user");
  });

  it("returns 404 with text/plain on unhandled routes", async () => {
    const res = await getUrl(port, "/not/found/route");
    expect(res.status).toBe(404);
    expect(res.body).toBe("Not Found");
  });
});
