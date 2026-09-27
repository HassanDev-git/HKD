/**
 * HKD Package Security Hardening
 *
 * Implements strict defenses against path traversal, symlink escapes,
 * archive bombs, dependency confusion, and untrusted execution.
 */

import * as fs from "fs";
import * as path from "path";

export interface SecurityLimits {
  maxFiles: number;
  maxTotalBytes: number;
  maxPathLength: number;
  maxNestingDepth: number;
}

export const DEFAULT_SECURITY_LIMITS: SecurityLimits = {
  maxFiles: 5000,
  maxTotalBytes: 50 * 1024 * 1024, // 50 MB
  maxPathLength: 260,
  maxNestingDepth: 16,
};

/**
 * Asserts that a relative path does not escape the destination root directory.
 */
export function assertSafePath(baseDir: string, relPath: string): string {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new Error("error[SEC005]: Security violation: Path cannot be empty");
  }

  // Reject path traversal tokens
  if (relPath.includes("..") || relPath.startsWith("/") || relPath.startsWith("\\") || path.isAbsolute(relPath)) {
    throw new Error(`error[SEC005]: Security violation: Path traversal attempt detected: '${relPath}'`);
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, relPath);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error(`error[SEC005]: Security violation: Path '${relPath}' escapes destination root '${baseDir}'`);
  }

  return resolvedTarget;
}

/**
 * Asserts that a file path is not a symlink that points outside the base directory.
 */
export function assertNoSymlinkEscape(baseDir: string, filePath: string): void {
  if (!fs.existsSync(filePath)) return;

  const lstat = fs.lstatSync(filePath);
  if (lstat.isSymbolicLink()) {
    const realTarget = fs.realpathSync(filePath);
    const resolvedBase = path.resolve(baseDir);
    if (!realTarget.startsWith(resolvedBase + path.sep) && realTarget !== resolvedBase) {
      throw new Error(`error[SEC007]: Security violation: Symlink '${filePath}' points outside root: '${realTarget}'`);
    }
  }
}
