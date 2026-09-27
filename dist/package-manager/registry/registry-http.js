"use strict";
/**
 * HKD Production HTTP Package Registry Client
 *
 * Implements the standard HKD Registry Protocol over HTTP/HTTPS with timeout handling,
 * authentication headers, and network resilience.
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
exports.HttpRegistryClient = void 0;
const http = __importStar(require("http"));
const https = __importStar(require("https"));
const crypto = __importStar(require("crypto"));
const url_1 = require("url");
const identity_js_1 = require("../identity.js");
class HttpRegistryClient {
    registryUrl;
    timeoutMs;
    token;
    constructor(options) {
        this.registryUrl =
            options?.registryUrl ||
                process.env.HKD_REGISTRY ||
                "https://registry.hkd-lang.org";
        this.timeoutMs = options?.timeoutMs || 10000;
        this.token = options?.token || process.env.HKD_AUTH_TOKEN;
    }
    request(method, endpoint, headers = {}, body) {
        return new Promise((resolve, reject) => {
            const fullUrl = new url_1.URL(endpoint, this.registryUrl);
            const isHttps = fullUrl.protocol === "https:";
            const client = isHttps ? https : http;
            const reqHeaders = {
                "User-Agent": "HKD-Package-Manager/0.1.0",
                Accept: "application/json, application/octet-stream",
                ...headers,
            };
            if (this.token) {
                reqHeaders["Authorization"] = `Bearer ${this.token}`;
            }
            const req = client.request(fullUrl, {
                method,
                headers: reqHeaders,
                timeout: this.timeoutMs,
            }, (res) => {
                const chunks = [];
                res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
                res.on("end", () => {
                    resolve({
                        statusCode: res.statusCode || 500,
                        headers: res.headers,
                        body: Buffer.concat(chunks),
                    });
                });
            });
            req.on("timeout", () => {
                req.destroy();
                reject(new Error(`error[NET001]: Request to '${fullUrl.toString()}' timed out after ${this.timeoutMs}ms`));
            });
            req.on("error", (err) => {
                reject(new Error(`error[NET002]: Network connection error: ${err.message}`));
            });
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    async getPackageMetadata(rawName) {
        const name = (0, identity_js_1.normalizePackageName)(rawName);
        try {
            const res = await this.request("GET", `/packages/${encodeURIComponent(name)}`);
            if (res.statusCode === 404)
                return null;
            if (res.statusCode !== 200) {
                throw new Error(`error[REG001]: Server responded with HTTP ${res.statusCode}: ${res.body.toString("utf-8")}`);
            }
            return JSON.parse(res.body.toString("utf-8"));
        }
        catch (err) {
            if (err.message.includes("NET001") || err.message.includes("NET002")) {
                throw err;
            }
            return null;
        }
    }
    async downloadPackage(rawName, version) {
        const name = (0, identity_js_1.normalizePackageName)(rawName);
        const res = await this.request("GET", `/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}/download`);
        if (res.statusCode === 404) {
            throw new Error(`error[REG004]: Package '${name}@${version}' not found in registry`);
        }
        if (res.statusCode !== 200) {
            throw new Error(`error[REG002]: Download failed with HTTP ${res.statusCode}: ${res.body.toString("utf-8")}`);
        }
        const digest = crypto.createHash("sha256").update(res.body).digest("hex");
        return {
            buffer: res.body,
            checksum: `sha256:${digest}`,
        };
    }
    async publishPackage(manifest, archiveBuf, token) {
        const name = (0, identity_js_1.normalizePackageName)(manifest.name);
        const version = manifest.version;
        const headers = {
            "Content-Type": "application/octet-stream",
            "X-Package-Name": name,
            "X-Package-Version": version,
        };
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await this.request("PUT", `/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`, headers, archiveBuf);
        if (res.statusCode === 409) {
            return {
                ok: false,
                message: `error[REG009]: Version '${version}' of package '${name}' already exists (immutable)`,
            };
        }
        if (res.statusCode === 201 || res.statusCode === 200) {
            return {
                ok: true,
                message: `Successfully published ${name}@${version}`,
            };
        }
        return {
            ok: false,
            message: `error[REG003]: Publish failed with HTTP ${res.statusCode}: ${res.body.toString("utf-8")}`,
        };
    }
    async searchPackages(query, limit = 20) {
        const res = await this.request("GET", `/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        if (res.statusCode !== 200) {
            return [];
        }
        try {
            const data = JSON.parse(res.body.toString("utf-8"));
            return Array.isArray(data) ? data : data.results || [];
        }
        catch {
            return [];
        }
    }
}
exports.HttpRegistryClient = HttpRegistryClient;
//# sourceMappingURL=registry-http.js.map