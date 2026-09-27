"use strict";
/**
 * HKD Production Hardened HTTP Server
 *
 * Implements connection limits, keep-alive management, body size limits,
 * live metrics, built-in health probes, and graceful shutdown.
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
exports.ProductionHttpServer = void 0;
const http = __importStar(require("http"));
const logging_js_1 = require("./logging.js");
class ProductionHttpServer {
    server;
    logger;
    options;
    activeSockets = new Set();
    routes = new Map();
    metrics = {
        activeConnections: 0,
        totalRequests: 0,
        totalErrors: 0,
        totalBytesTransferred: 0,
        startTime: Date.now(),
        uptimeSeconds: 0,
    };
    isShuttingDown = false;
    constructor(options = {}, logger) {
        this.logger = logger || new logging_js_1.ProductionLogger("info", false);
        this.options = {
            host: options.host || "127.0.0.1",
            port: options.port || 8080,
            maxConnections: options.maxConnections || 10000,
            requestTimeoutMs: options.requestTimeoutMs || 30000,
            keepAliveTimeoutMs: options.keepAliveTimeoutMs || 5000,
            maxRequestBodyBytes: options.maxRequestBodyBytes || 10 * 1024 * 1024,
            shutdownTimeoutMs: options.shutdownTimeoutMs || 5000,
            exposeMetrics: options.exposeMetrics ?? true,
        };
        this.server = http.createServer((req, res) => this.handleRequest(req, res));
        this.server.maxConnections = this.options.maxConnections;
        this.server.keepAliveTimeout = this.options.keepAliveTimeoutMs;
        this.server.headersTimeout = this.options.requestTimeoutMs;
        this.server.on("connection", (socket) => {
            this.metrics.activeConnections++;
            this.activeSockets.add(socket);
            socket.on("close", () => {
                this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);
                this.activeSockets.delete(socket);
            });
        });
        // Default routes
        this.route("GET", "/health", (_req, res) => {
            const payload = JSON.stringify({
                status: "ok",
                uptimeSeconds: Math.floor((Date.now() - this.metrics.startTime) / 1000),
                activeConnections: this.metrics.activeConnections,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(payload);
        });
        this.route("GET", "/ready", (_req, res) => {
            if (this.isShuttingDown) {
                res.writeHead(503, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "shutting_down" }));
            }
            else {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "ready" }));
            }
        });
        if (this.options.exposeMetrics) {
            this.route("GET", "/metrics", (_req, res) => {
                this.metrics.uptimeSeconds = Math.floor((Date.now() - this.metrics.startTime) / 1000);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify(this.metrics, null, 2));
            });
        }
    }
    route(method, pathName, handler) {
        const key = `${method.toUpperCase()}:${pathName}`;
        this.routes.set(key, handler);
    }
    get(pathName, handler) {
        this.route("GET", pathName, handler);
    }
    post(pathName, handler) {
        this.route("POST", pathName, handler);
    }
    getMetrics() {
        this.metrics.uptimeSeconds = Math.floor((Date.now() - this.metrics.startTime) / 1000);
        return { ...this.metrics };
    }
    async handleRequest(req, res) {
        this.metrics.totalRequests++;
        if (this.isShuttingDown) {
            res.writeHead(503, { "Content-Type": "text/plain", Connection: "close" });
            res.end("Server is shutting down");
            return;
        }
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        const key = `${req.method?.toUpperCase()}:${url.pathname}`;
        const handler = this.routes.get(key);
        let body = "";
        let bodySize = 0;
        let sizeExceeded = false;
        req.on("data", (chunk) => {
            bodySize += chunk.length;
            this.metrics.totalBytesTransferred += chunk.length;
            if (bodySize > this.options.maxRequestBodyBytes) {
                sizeExceeded = true;
                req.destroy();
            }
            else {
                body += chunk.toString("utf-8");
            }
        });
        req.on("end", async () => {
            if (sizeExceeded) {
                this.metrics.totalErrors++;
                res.writeHead(413, { "Content-Type": "text/plain" });
                res.end("Payload Too Large");
                return;
            }
            if (handler) {
                try {
                    await handler(req, res, body);
                }
                catch (err) {
                    this.metrics.totalErrors++;
                    this.logger.error(`Handler error: ${err.message}`, { path: url.pathname });
                    if (!res.headersSent) {
                        res.writeHead(500, { "Content-Type": "text/plain" });
                        res.end("Internal Server Error");
                    }
                }
            }
            else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                res.end("Not Found");
            }
        });
    }
    async start() {
        return new Promise((resolve, reject) => {
            this.server.listen(this.options.port, this.options.host, () => {
                this.logger.info(`HKD HTTP Server listening on http://${this.options.host}:${this.options.port}`, {
                    port: this.options.port,
                    host: this.options.host,
                });
                resolve();
            });
            this.server.on("error", reject);
        });
    }
    async shutdown() {
        if (this.isShuttingDown)
            return;
        this.isShuttingDown = true;
        this.logger.info("Initiating graceful HTTP server shutdown...");
        // Stop accepting new connections
        this.server.close();
        // Close idle sockets
        for (const socket of this.activeSockets) {
            socket.end();
        }
        // Force close sockets after deadline
        const timer = setTimeout(() => {
            for (const socket of this.activeSockets) {
                socket.destroy();
            }
        }, this.options.shutdownTimeoutMs);
        return new Promise((resolve) => {
            this.server.on("close", () => {
                clearTimeout(timer);
                this.logger.info("HTTP server closed cleanly.");
                resolve();
            });
        });
    }
}
exports.ProductionHttpServer = ProductionHttpServer;
//# sourceMappingURL=http-server.js.map