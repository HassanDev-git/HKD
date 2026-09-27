/**
 * HKD Package Format 2.0 (.hkdpack)
 *
 * Deterministic archive format guaranteeing reproducible package creation,
 * cryptographic SHA-256 integrity, and strict decompression bomb protection.
 */
import { HkdManifest } from "./index.js";
export declare const ARCHIVE_MAGIC = "HKDPACK2\n";
export declare const MAX_ARCHIVE_FILES = 5000;
export declare const MAX_UNCOMPRESSED_BYTES: number;
export declare const MAX_PATH_LENGTH = 260;
export declare const MAX_NESTING_DEPTH = 16;
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
export declare function packArchive(dir: string, manifest: HkdManifest): PackResult;
/**
 * Unpacks a `.hkdpack` 2.0 archive into targetDir with strict security checks.
 */
export declare function unpackArchive(archiveBuf: Buffer, targetDir: string, expectedChecksum?: string): UnpackResult;
//# sourceMappingURL=archive.d.ts.map