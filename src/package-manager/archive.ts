/**
 * HKD Package Format 2.0 (.hkdpack)
 *
 * Deterministic archive format guaranteeing reproducible package creation,
 * cryptographic SHA-256 integrity, and strict decompression bomb protection.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { HkdManifest, writeManifest } from "./index.js";

export const ARCHIVE_MAGIC = "HKDPACK2\n"; // 9 bytes
export const MAX_ARCHIVE_FILES = 5000;
export const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PATH_LENGTH = 260;
export const MAX_NESTING_DEPTH = 16;

export interface ArchiveFileEntry {
  relPath: string;
  content: Buffer;
}

export interface PackResult {
  buffer: Buffer;
  checksum: string;
  fileCount: number;
}

export interface UnpackResult {
  manifest: HkdManifest;
  checksum: string;
  files: string[];
}

/**
 * Packs a directory into a deterministic `.hkdpack` 2.0 archive.
 * All paths are normalized with forward slashes and entries are lexicographically sorted.
 */
export function packArchive(dir: string, manifest: HkdManifest): PackResult {
  const fileEntries: ArchiveFileEntry[] = [];

  function collect(currentDir: string) {
    const items = fs.readdirSync(currentDir).sort();
    for (const item of items) {
      if (
        item === "node_modules" ||
        item === ".git" ||
        item === "target" ||
        item === ".hkd" ||
        item === "vendor" ||
        item.endsWith(".hkdpack") ||
        item.endsWith(".tmp")
      ) {
        continue;
      }

      const fullPath = path.join(currentDir, item);
      const relPath = path.relative(dir, fullPath).replace(/\\/g, "/");

      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        collect(fullPath);
      } else {
        fileEntries.push({
          relPath,
          content: fs.readFileSync(fullPath),
        });
      }
    }
  }

  collect(dir);

  // Deterministic sorting of all file paths
  fileEntries.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const parts: Buffer[] = [];

  // 1. Magic Header
  parts.push(Buffer.from(ARCHIVE_MAGIC, "ascii"));

  // 2. Deterministic Manifest JSON
  const sortedManifestKeys = Object.keys(manifest).sort();
  const sortedManifest: Record<string, any> = {};
  for (const k of sortedManifestKeys) {
    sortedManifest[k] = (manifest as any)[k];
  }
  const manifestStr = JSON.stringify(sortedManifest);
  const manifestBuf = Buffer.from(manifestStr, "utf-8");
  const manifestLenBuf = Buffer.alloc(4);
  manifestLenBuf.writeUInt32BE(manifestBuf.length, 0);
  parts.push(manifestLenBuf);
  parts.push(manifestBuf);

  // 3. File Count
  const countBuf = Buffer.alloc(4);
  countBuf.writeUInt32BE(fileEntries.length, 0);
  parts.push(countBuf);

  // 4. File Entries
  for (const entry of fileEntries) {
    const pathBuf = Buffer.from(entry.relPath, "utf-8");
    const pathLenBuf = Buffer.alloc(4);
    pathLenBuf.writeUInt32BE(pathBuf.length, 0);
    parts.push(pathLenBuf);
    parts.push(pathBuf);

    const contentLenBuf = Buffer.alloc(4);
    contentLenBuf.writeUInt32BE(entry.content.length, 0);
    parts.push(contentLenBuf);
    parts.push(entry.content);
  }

  const finalBuffer = Buffer.concat(parts);
  const digest = crypto.createHash("sha256").update(finalBuffer).digest("hex");
  const checksum = `sha256:${digest}`;

  return {
    buffer: finalBuffer,
    checksum,
    fileCount: fileEntries.length,
  };
}

/**
 * Unpacks a `.hkdpack` 2.0 archive into targetDir with strict security checks.
 */
export function unpackArchive(
  archiveBuf: Buffer,
  targetDir: string,
  expectedChecksum?: string
): UnpackResult {
  // 1. Verify Checksum if provided
  const actualDigest = crypto.createHash("sha256").update(archiveBuf).digest("hex");
  const actualChecksum = `sha256:${actualDigest}`;

  if (expectedChecksum && expectedChecksum !== actualChecksum) {
    throw new Error(
      `error[SEC001]: Package archive integrity failure. Expected: ${expectedChecksum}, computed: ${actualChecksum}`
    );
  }

  let offset = 0;

  // 2. Check Magic Header
  const magicLen = ARCHIVE_MAGIC.length;
  if (archiveBuf.length < magicLen) {
    throw new Error("error[SEC002]: Corrupted package archive: buffer too small");
  }

  const magic = archiveBuf.subarray(0, magicLen).toString("ascii");
  if (magic !== ARCHIVE_MAGIC) {
    throw new Error(`error[SEC002]: Invalid package archive magic header '${magic.trim()}'`);
  }
  offset += magicLen;

  // 3. Read Manifest
  if (offset + 4 > archiveBuf.length) {
    throw new Error("error[SEC002]: Truncated archive reading manifest length");
  }
  const manifestLen = archiveBuf.readUInt32BE(offset);
  offset += 4;

  if (offset + manifestLen > archiveBuf.length) {
    throw new Error("error[SEC002]: Truncated archive reading manifest body");
  }
  const manifestStr = archiveBuf.subarray(offset, offset + manifestLen).toString("utf-8");
  offset += manifestLen;

  let manifest: HkdManifest;
  try {
    manifest = JSON.parse(manifestStr);
  } catch (err: any) {
    throw new Error(`error[SEC002]: Malformed package manifest JSON: ${err.message}`);
  }

  // 4. Read File Count & Apply Limits
  if (offset + 4 > archiveBuf.length) {
    throw new Error("error[SEC002]: Truncated archive reading file count");
  }
  const fileCount = archiveBuf.readUInt32BE(offset);
  offset += 4;

  if (fileCount > MAX_ARCHIVE_FILES) {
    throw new Error(
      `error[SEC003]: Archive bomb detected: file count (${fileCount}) exceeds limit (${MAX_ARCHIVE_FILES})`
    );
  }

  let totalUncompressedBytes = 0;
  const targetDirResolved = path.resolve(targetDir);
  fs.mkdirSync(targetDirResolved, { recursive: true });

  const extractedFiles: string[] = [];

  for (let i = 0; i < fileCount; i++) {
    if (offset + 4 > archiveBuf.length) {
      throw new Error(`error[SEC002]: Truncated archive at file #${i} path length`);
    }
    const pathLen = archiveBuf.readUInt32BE(offset);
    offset += 4;

    if (pathLen > MAX_PATH_LENGTH) {
      throw new Error(`error[SEC004]: File path length (${pathLen}) exceeds maximum (${MAX_PATH_LENGTH})`);
    }

    if (offset + pathLen > archiveBuf.length) {
      throw new Error(`error[SEC002]: Truncated archive at file #${i} path string`);
    }
    const relPath = archiveBuf.subarray(offset, offset + pathLen).toString("utf-8");
    offset += pathLen;

    // Security check: Path Traversal
    if (relPath.includes("..") || path.isAbsolute(relPath) || relPath.startsWith("/") || relPath.startsWith("\\")) {
      throw new Error(`error[SEC005]: Security violation: Path traversal attempt detected: '${relPath}'`);
    }

    // Security check: Nesting depth
    const depth = relPath.split("/").length;
    if (depth > MAX_NESTING_DEPTH) {
      throw new Error(`error[SEC006]: Security violation: Directory nesting depth (${depth}) exceeds limit (${MAX_NESTING_DEPTH})`);
    }

    const resolvedFilePath = path.resolve(targetDirResolved, relPath);
    if (!resolvedFilePath.startsWith(targetDirResolved + path.sep) && resolvedFilePath !== targetDirResolved) {
      throw new Error(`error[SEC005]: Security violation: Target path escapes destination directory: '${relPath}'`);
    }

    if (offset + 4 > archiveBuf.length) {
      throw new Error(`error[SEC002]: Truncated archive at file #${i} content length`);
    }
    const contentLen = archiveBuf.readUInt32BE(offset);
    offset += 4;

    totalUncompressedBytes += contentLen;
    if (totalUncompressedBytes > MAX_UNCOMPRESSED_BYTES) {
      throw new Error(
        `error[SEC003]: Archive bomb detected: total extracted bytes exceeds limit (${MAX_UNCOMPRESSED_BYTES})`
      );
    }

    if (offset + contentLen > archiveBuf.length) {
      throw new Error(`error[SEC002]: Truncated archive at file #${i} content body`);
    }
    const content = archiveBuf.subarray(offset, offset + contentLen);
    offset += contentLen;

    fs.mkdirSync(path.dirname(resolvedFilePath), { recursive: true });
    fs.writeFileSync(resolvedFilePath, content);
    extractedFiles.push(relPath);
  }

  // Ensure target directory has hkd.toml
  const destManifestPath = path.join(targetDirResolved, "hkd.toml");
  if (!fs.existsSync(destManifestPath)) {
    writeManifest(targetDirResolved, manifest);
    extractedFiles.push("hkd.toml");
  }

  return {
    manifest,
    checksum: actualChecksum,
    files: extractedFiles,
  };
}
