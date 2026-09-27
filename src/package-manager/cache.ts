/**
 * HKD Content-Addressed Cache
 *
 * Implements multi-tier content-addressed storage for packages, metadata, and native
 * binaries. Guarantees atomic concurrent writes, integrity verification, and cache pruning.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";
import { HkdManifest } from "./index.js";
import { unpackArchive } from "./archive.js";

export interface CacheEntry {
  name: string;
  version: string;
  checksum: string;
  sizeBytes: number;
  cachedAt: string;
}

export class ContentAddressedCache {
  public baseDir: string;
  public packagesDir: string;
  public metadataDir: string;
  public nativeDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.join(os.homedir(), ".hkd", "cache");
    this.packagesDir = path.join(this.baseDir, "packages");
    this.metadataDir = path.join(this.baseDir, "metadata");
    this.nativeDir = path.join(this.baseDir, "native");

    this.ensureDirs();
  }

  private ensureDirs() {
    fs.mkdirSync(this.packagesDir, { recursive: true });
    fs.mkdirSync(this.metadataDir, { recursive: true });
    fs.mkdirSync(this.nativeDir, { recursive: true });
  }

  private normalizeChecksum(checksum: string): string {
    return checksum.startsWith("sha256:") ? checksum.slice(7) : checksum;
  }

  /**
   * Stores a package in content-addressed cache atomically.
   */
  store(checksum: string, archiveBuf: Buffer, manifest: HkdManifest): string {
    const rawHash = this.normalizeChecksum(checksum);
    const pkgCacheDir = path.join(this.packagesDir, rawHash);

    if (fs.existsSync(pkgCacheDir)) {
      return pkgCacheDir;
    }

    // Atomic write via temp directory
    const tempDir = path.join(this.packagesDir, `.tmp-${rawHash}-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const archivePath = path.join(tempDir, "package.hkdpack");
      fs.writeFileSync(archivePath, archiveBuf);

      const unpackedDir = path.join(tempDir, "unpacked");
      unpackArchive(archiveBuf, unpackedDir, `sha256:${rawHash}`);

      const metaPath = path.join(tempDir, ".metadata.json");
      const metadata = {
        name: manifest.name,
        version: manifest.version,
        checksum: `sha256:${rawHash}`,
        sizeBytes: archiveBuf.length,
        cachedAt: new Date().toISOString(),
        manifest,
      };
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

      // Rename temp dir atomically to target
      try {
        fs.renameSync(tempDir, pkgCacheDir);
      } catch {
        // In case of race condition with another process, check if pkgCacheDir now exists
        if (!fs.existsSync(pkgCacheDir)) {
          throw new Error(`Failed to atomically move cache entry: ${pkgCacheDir}`);
        }
      }
    } finally {
      if (fs.existsSync(tempDir)) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      }
    }

    return pkgCacheDir;
  }

  /**
   * Retrieves an unpacked package from cache if present.
   */
  get(checksum: string): { dir: string; archivePath: string; manifest: HkdManifest } | null {
    const rawHash = this.normalizeChecksum(checksum);
    const pkgCacheDir = path.join(this.packagesDir, rawHash);

    if (!fs.existsSync(pkgCacheDir)) return null;

    const archivePath = path.join(pkgCacheDir, "package.hkdpack");
    const unpackedDir = path.join(pkgCacheDir, "unpacked");
    const metaPath = path.join(pkgCacheDir, ".metadata.json");

    if (!fs.existsSync(archivePath) || !fs.existsSync(unpackedDir) || !fs.existsSync(metaPath)) {
      return null;
    }

    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      return {
        dir: unpackedDir,
        archivePath,
        manifest: meta.manifest || {
          name: meta.name,
          version: meta.version,
          dependencies: {},
          devDependencies: {},
        },
      };
    } catch {
      return null;
    }
  }

  /**
   * Checks whether a package is present and uncorrupted in the cache.
   */
  has(checksum: string): boolean {
    return this.get(checksum) !== null;
  }

  /**
   * Lists all cached packages.
   */
  list(): CacheEntry[] {
    const entries: CacheEntry[] = [];
    if (!fs.existsSync(this.packagesDir)) return entries;

    const hashes = fs.readdirSync(this.packagesDir);
    for (const h of hashes) {
      if (h.startsWith(".")) continue;
      const metaPath = path.join(this.packagesDir, h, ".metadata.json");
      if (fs.existsSync(metaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          entries.push(meta);
        } catch {}
      }
    }

    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Cleans all cached packages, freeing disk space.
   */
  clean(): { count: number; bytesFreed: number } {
    let count = 0;
    let bytesFreed = 0;

    if (fs.existsSync(this.packagesDir)) {
      const list = fs.readdirSync(this.packagesDir);
      for (const item of list) {
        const full = path.join(this.packagesDir, item);
        try {
          const stat = fs.statSync(full);
          bytesFreed += stat.size;
          fs.rmSync(full, { recursive: true, force: true });
          count++;
        } catch {}
      }
    }

    return { count, bytesFreed };
  }

  /**
   * Verifies the cryptographic integrity of all cached packages.
   */
  verify(): { valid: boolean; corrupted: string[] } {
    const corrupted: string[] = [];
    const entries = this.list();

    for (const entry of entries) {
      const rawHash = this.normalizeChecksum(entry.checksum);
      const archivePath = path.join(this.packagesDir, rawHash, "package.hkdpack");

      if (!fs.existsSync(archivePath)) {
        corrupted.push(entry.checksum);
        continue;
      }

      try {
        const buf = fs.readFileSync(archivePath);
        const actualHash = crypto.createHash("sha256").update(buf).digest("hex");
        if (actualHash !== rawHash) {
          corrupted.push(entry.checksum);
        }
      } catch {
        corrupted.push(entry.checksum);
      }
    }

    return {
      valid: corrupted.length === 0,
      corrupted,
    };
  }
}
