/**
 * HKD Production HTTP Package Registry Client
 *
 * Implements the standard HKD Registry Protocol over HTTP/HTTPS with timeout handling,
 * authentication headers, and network resilience.
 */

import * as http from "http";
import * as https from "https";
import * as crypto from "crypto";
import { URL } from "url";
import { HkdManifest } from "../index.js";
import { normalizePackageName } from "../identity.js";
import {
  RegistryClient,
  PackageMetadata,
  DownloadResult,
  PublishResult,
  SearchResult,
} from "./registry-client.js";

export interface HttpRegistryOptions {
  registryUrl?: string;
  timeoutMs?: number;
  token?: string;
}

export class HttpRegistryClient implements RegistryClient {
  public registryUrl: string;
  public timeoutMs: number;
  public token?: string;

  constructor(options?: HttpRegistryOptions) {
    this.registryUrl =
      options?.registryUrl ||
      process.env.HKD_REGISTRY ||
      "https://registry.hkd-lang.org";
    this.timeoutMs = options?.timeoutMs || 10000;
    this.token = options?.token || process.env.HKD_AUTH_TOKEN;
  }

  private request(
    method: string,
    endpoint: string,
    headers: Record<string, string> = {},
    body?: Buffer | string
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const fullUrl = new URL(endpoint, this.registryUrl);
      const isHttps = fullUrl.protocol === "https:";
      const client = isHttps ? https : http;

      const reqHeaders: Record<string, string> = {
        "User-Agent": "HKD-Package-Manager/0.1.0",
        Accept: "application/json, application/octet-stream",
        ...headers,
      };

      if (this.token) {
        reqHeaders["Authorization"] = `Bearer ${this.token}`;
      }

      const req = client.request(
        fullUrl,
        {
          method,
          headers: reqHeaders,
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            resolve({
              statusCode: res.statusCode || 500,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        }
      );

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

  async getPackageMetadata(rawName: string): Promise<PackageMetadata | null> {
    const name = normalizePackageName(rawName);
    try {
      const res = await this.request("GET", `/packages/${encodeURIComponent(name)}`);
      if (res.statusCode === 404) return null;
      if (res.statusCode !== 200) {
        throw new Error(`error[REG001]: Server responded with HTTP ${res.statusCode}: ${res.body.toString("utf-8")}`);
      }
      return JSON.parse(res.body.toString("utf-8"));
    } catch (err: any) {
      if (err.message.includes("NET001") || err.message.includes("NET002")) {
        throw err;
      }
      return null;
    }
  }

  async downloadPackage(rawName: string, version: string): Promise<DownloadResult> {
    const name = normalizePackageName(rawName);
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

  async publishPackage(
    manifest: HkdManifest,
    archiveBuf: Buffer,
    token?: string
  ): Promise<PublishResult> {
    const name = normalizePackageName(manifest.name);
    const version = manifest.version;

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-Package-Name": name,
      "X-Package-Version": version,
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await this.request(
      "PUT",
      `/packages/${encodeURIComponent(name)}/${encodeURIComponent(version)}`,
      headers,
      archiveBuf
    );

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

  async searchPackages(query: string, limit = 20): Promise<SearchResult[]> {
    const res = await this.request(
      "GET",
      `/search?q=${encodeURIComponent(query)}&limit=${limit}`
    );

    if (res.statusCode !== 200) {
      return [];
    }

    try {
      const data = JSON.parse(res.body.toString("utf-8"));
      return Array.isArray(data) ? data : data.results || [];
    } catch {
      return [];
    }
  }
}
