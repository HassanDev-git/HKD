/**
 * HKD Mock Package Registry Client
 *
 * Implements an in-memory, fully-featured RegistryClient for tests,
 * offline simulation, and local package repository serving.
 */

import * as crypto from "crypto";
import { HkdManifest } from "../index.js";
import { normalizePackageName } from "../identity.js";
import {
  RegistryClient,
  PackageMetadata,
  DownloadResult,
  PublishResult,
  SearchResult,
} from "./registry-client.js";

export class MockRegistryClient implements RegistryClient {
  private packages: Map<string, PackageMetadata> = new Map();
  private archives: Map<string, Buffer> = new Map(); // "name@version" -> Buffer

  constructor() {}

  async getPackageMetadata(rawName: string): Promise<PackageMetadata | null> {
    const name = normalizePackageName(rawName);
    const meta = this.packages.get(name);
    return meta ? JSON.parse(JSON.stringify(meta)) : null;
  }

  async downloadPackage(rawName: string, version: string): Promise<DownloadResult> {
    const name = normalizePackageName(rawName);
    const key = `${name}@${version}`;
    const buf = this.archives.get(key);

    if (!buf) {
      throw new Error(`error[REG004]: Package '${key}' not found in registry`);
    }

    const digest = crypto.createHash("sha256").update(buf).digest("hex");
    return {
      buffer: buf,
      checksum: `sha256:${digest}`,
    };
  }

  async publishPackage(
    manifest: HkdManifest,
    archiveBuf: Buffer,
    _token?: string
  ): Promise<PublishResult> {
    const name = normalizePackageName(manifest.name);
    const version = manifest.version;
    const key = `${name}@${version}`;

    let meta = this.packages.get(name);
    if (!meta) {
      meta = {
        name,
        description: manifest.description,
        versions: {},
        distTags: {},
      };
      this.packages.set(name, meta);
    }

    // Immutability check: cannot overwrite existing version
    if (meta.versions[version]) {
      return {
        ok: false,
        message: `error[REG009]: Package version '${key}' already published and is immutable`,
      };
    }

    const digest = crypto.createHash("sha256").update(archiveBuf).digest("hex");
    const checksum = `sha256:${digest}`;

    meta.versions[version] = {
      version,
      checksum,
      dependencies: Object.fromEntries(
        Object.entries(manifest.dependencies || {}).map(([k, v]) => [
          normalizePackageName(k),
          typeof v === "string" ? v : "*",
        ])
      ),
      publishedAt: new Date().toISOString(),
      author: manifest.author,
    };

    meta.distTags["latest"] = version;
    this.archives.set(key, archiveBuf);

    return {
      ok: true,
      message: `Successfully published ${key}`,
    };
  }

  async searchPackages(query: string, limit = 20): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const [name, meta] of this.packages.entries()) {
      if (
        name.includes(q) ||
        (meta.description && meta.description.toLowerCase().includes(q))
      ) {
        const latestVer = meta.distTags["latest"] || Object.keys(meta.versions).pop() || "0.0.0";
        results.push({
          name,
          version: latestVer,
          description: meta.description || "",
        });
      }
    }

    return results.slice(0, limit);
  }

  // Test helper: seed package directly
  seedPackage(manifest: HkdManifest, archiveBuf: Buffer) {
    this.publishPackage(manifest, archiveBuf);
  }
}
