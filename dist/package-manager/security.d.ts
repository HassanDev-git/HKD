/**
 * HKD Package Security Hardening
 *
 * Implements strict defenses against path traversal, symlink escapes,
 * archive bombs, dependency confusion, and untrusted execution.
 */
export interface SecurityLimits {
    maxFiles: number;
    maxTotalBytes: number;
    maxPathLength: number;
    maxNestingDepth: number;
}
export declare const DEFAULT_SECURITY_LIMITS: SecurityLimits;
/**
 * Asserts that a relative path does not escape the destination root directory.
 */
export declare function assertSafePath(baseDir: string, relPath: string): string;
/**
 * Asserts that a file path is not a symlink that points outside the base directory.
 */
export declare function assertNoSymlinkEscape(baseDir: string, filePath: string): void;
//# sourceMappingURL=security.d.ts.map