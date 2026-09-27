/**
 * HKD Production Hardened HTTP Server
 *
 * Implements connection limits, keep-alive management, body size limits,
 * live metrics, built-in health probes, and graceful shutdown.
 */
import * as http from "http";
import { ProductionLogger } from "./logging.js";
export interface HttpServerOptions {
    host?: string;
    port?: number;
    maxConnections?: number;
    requestTimeoutMs?: number;
    keepAliveTimeoutMs?: number;
    maxRequestBodyBytes?: number;
    shutdownTimeoutMs?: number;
    exposeMetrics?: boolean;
}
export interface ServerMetrics {
    activeConnections: number;
    totalRequests: number;
    totalErrors: number;
    totalBytesTransferred: number;
    startTime: number;
    uptimeSeconds: number;
}
export type HttpHandler = (req: http.IncomingMessage, res: http.ServerResponse, body: string) => Promise<void> | void;
export declare class ProductionHttpServer {
    private server;
    private logger;
    private options;
    private activeSockets;
    private routes;
    private metrics;
    private isShuttingDown;
    constructor(options?: HttpServerOptions, logger?: ProductionLogger);
    route(method: string, pathName: string, handler: HttpHandler): void;
    get(pathName: string, handler: HttpHandler): void;
    post(pathName: string, handler: HttpHandler): void;
    getMetrics(): ServerMetrics;
    private handleRequest;
    start(): Promise<void>;
    shutdown(): Promise<void>;
}
//# sourceMappingURL=http-server.d.ts.map