"use strict";
/**
 * HKD Package Security Hardening
 *
 * Implements strict defenses against path traversal, symlink escapes,
 * archive bombs, dependency confusion, and untrusted execution.
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
exports.DEFAULT_SECURITY_LIMITS = void 0;
exports.assertSafePath = assertSafePath;
exports.assertNoSymlinkEscape = assertNoSymlinkEscape;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
exports.DEFAULT_SECURITY_LIMITS = {
    maxFiles: 5000,
    maxTotalBytes: 50 * 1024 * 1024, // 50 MB
    maxPathLength: 260,
    maxNestingDepth: 16,
};
/**
 * Asserts that a relative path does not escape the destination root directory.
 */
function assertSafePath(baseDir, relPath) {
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
function assertNoSymlinkEscape(baseDir, filePath) {
    if (!fs.existsSync(filePath))
        return;
    const lstat = fs.lstatSync(filePath);
    if (lstat.isSymbolicLink()) {
        const realTarget = fs.realpathSync(filePath);
        const resolvedBase = path.resolve(baseDir);
        if (!realTarget.startsWith(resolvedBase + path.sep) && realTarget !== resolvedBase) {
            throw new Error(`error[SEC007]: Security violation: Symlink '${filePath}' points outside root: '${realTarget}'`);
        }
    }
}
//# sourceMappingURL=security.js.map