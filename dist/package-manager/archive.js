"use strict";
/**
 * HKD Package Format 2.0 (.hkdpack)
 *
 * Deterministic archive format guaranteeing reproducible package creation,
 * cryptographic SHA-256 integrity, and strict decompression bomb protection.
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
exports.MAX_NESTING_DEPTH = exports.MAX_PATH_LENGTH = exports.MAX_UNCOMPRESSED_BYTES = exports.MAX_ARCHIVE_FILES = exports.ARCHIVE_MAGIC = void 0;
exports.packArchive = packArchive;
exports.unpackArchive = unpackArchive;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const crypto = __importStar(require("crypto"));
const index_js_1 = require("./index.js");
exports.ARCHIVE_MAGIC = "HKDPACK2\n"; // 9 bytes
exports.MAX_ARCHIVE_FILES = 5000;
exports.MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
exports.MAX_PATH_LENGTH = 260;
exports.MAX_NESTING_DEPTH = 16;
/**
 * Packs a directory into a deterministic `.hkdpack` 2.0 archive.
 * All paths are normalized with forward slashes and entries are lexicographically sorted.
 */
function packArchive(dir, manifest) {
    const fileEntries = [];
    function collect(currentDir) {
        const items = fs.readdirSync(currentDir).sort();
        for (const item of items) {
            if (item === "node_modules" ||
                item === ".git" ||
                item === "target" ||
                item === ".hkd" ||
                item === "vendor" ||
                item.endsWith(".hkdpack") ||
                item.endsWith(".tmp")) {
                continue;
            }
            const fullPath = path.join(currentDir, item);
            const relPath = path.relative(dir, fullPath).replace(/\\/g, "/");
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                collect(fullPath);
            }
            else {
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
    const parts = [];
    // 1. Magic Header
    parts.push(Buffer.from(exports.ARCHIVE_MAGIC, "ascii"));
    // 2. Deterministic Manifest JSON
    const sortedManifestKeys = Object.keys(manifest).sort();
    const sortedManifest = {};
    for (const k of sortedManifestKeys) {
        sortedManifest[k] = manifest[k];
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
function unpackArchive(archiveBuf, targetDir, expectedChecksum) {
    // 1. Verify Checksum if provided
    const actualDigest = crypto.createHash("sha256").update(archiveBuf).digest("hex");
    const actualChecksum = `sha256:${actualDigest}`;
    if (expectedChecksum && expectedChecksum !== actualChecksum) {
        throw new Error(`error[SEC001]: Package archive integrity failure. Expected: ${expectedChecksum}, computed: ${actualChecksum}`);
    }
    let offset = 0;
    // 2. Check Magic Header
    const magicLen = exports.ARCHIVE_MAGIC.length;
    if (archiveBuf.length < magicLen) {
        throw new Error("error[SEC002]: Corrupted package archive: buffer too small");
    }
    const magic = archiveBuf.subarray(0, magicLen).toString("ascii");
    if (magic !== exports.ARCHIVE_MAGIC) {
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
    let manifest;
    try {
        manifest = JSON.parse(manifestStr);
    }
    catch (err) {
        throw new Error(`error[SEC002]: Malformed package manifest JSON: ${err.message}`);
    }
    // 4. Read File Count & Apply Limits
    if (offset + 4 > archiveBuf.length) {
        throw new Error("error[SEC002]: Truncated archive reading file count");
    }
    const fileCount = archiveBuf.readUInt32BE(offset);
    offset += 4;
    if (fileCount > exports.MAX_ARCHIVE_FILES) {
        throw new Error(`error[SEC003]: Archive bomb detected: file count (${fileCount}) exceeds limit (${exports.MAX_ARCHIVE_FILES})`);
    }
    let totalUncompressedBytes = 0;
    const targetDirResolved = path.resolve(targetDir);
    fs.mkdirSync(targetDirResolved, { recursive: true });
    const extractedFiles = [];
    for (let i = 0; i < fileCount; i++) {
        if (offset + 4 > archiveBuf.length) {
            throw new Error(`error[SEC002]: Truncated archive at file #${i} path length`);
        }
        const pathLen = archiveBuf.readUInt32BE(offset);
        offset += 4;
        if (pathLen > exports.MAX_PATH_LENGTH) {
            throw new Error(`error[SEC004]: File path length (${pathLen}) exceeds maximum (${exports.MAX_PATH_LENGTH})`);
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
        if (depth > exports.MAX_NESTING_DEPTH) {
            throw new Error(`error[SEC006]: Security violation: Directory nesting depth (${depth}) exceeds limit (${exports.MAX_NESTING_DEPTH})`);
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
        if (totalUncompressedBytes > exports.MAX_UNCOMPRESSED_BYTES) {
            throw new Error(`error[SEC003]: Archive bomb detected: total extracted bytes exceeds limit (${exports.MAX_UNCOMPRESSED_BYTES})`);
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
        (0, index_js_1.writeManifest)(targetDirResolved, manifest);
        extractedFiles.push("hkd.toml");
    }
    return {
        manifest,
        checksum: actualChecksum,
        files: extractedFiles,
    };
}
//# sourceMappingURL=archive.js.map