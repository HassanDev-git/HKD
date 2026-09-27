"use strict";
/**
 * HKD Package Identity & Canonical Naming Rules
 *
 * Enforces strict validation and canonical normalization across all package
 * references, preventing path traversal, registry confusion, reserved collisions,
 * and malformed identifiers.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validatePackageName = validatePackageName;
exports.normalizePackageName = normalizePackageName;
exports.formatPackageId = formatPackageId;
exports.validateIntegrity = validateIntegrity;
const RESERVED_NAMES = new Set([
    "hkd",
    "std",
    "core",
    "builtin",
    "main",
    "root",
    "self",
    "super",
    "con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com2",
    "com3",
    "com4",
    "com5",
    "com6",
    "com7",
    "com8",
    "com9",
    "lpt1",
    "lpt2",
    "lpt3",
    "lpt4",
    "lpt5",
    "lpt6",
    "lpt7",
    "lpt8",
    "lpt9",
]);
const VALID_NAME_REGEX = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;
/**
 * Validates whether a given package name adheres to HKD package security rules.
 */
function validatePackageName(rawName) {
    if (typeof rawName !== "string" || rawName.length === 0) {
        return { valid: false, error: "Package name cannot be empty" };
    }
    if (rawName !== rawName.trim()) {
        return { valid: false, error: "Package name cannot contain leading or trailing whitespace" };
    }
    const name = rawName;
    if (name.length > 64) {
        return { valid: false, error: "Package name exceeds maximum length of 64 characters" };
    }
    // Prevent path traversal
    if (name.includes("/") || name.includes("\\") || name.includes("..")) {
        return { valid: false, error: "Package name cannot contain path separators or '..'" };
    }
    // Prevent control characters
    for (let i = 0; i < name.length; i++) {
        const code = name.charCodeAt(i);
        if (code < 32 || code === 127) {
            return { valid: false, error: "Package name contains invalid control characters" };
        }
    }
    // Prevent uppercase / non-canonical characters
    if (name !== name.toLowerCase()) {
        return { valid: false, error: "Package name must be lowercase" };
    }
    // Check reserved names
    if (RESERVED_NAMES.has(name)) {
        return { valid: false, error: `Package name '${name}' is reserved by HKD core` };
    }
    // Enforce format [a-z0-9]([a-z0-9_-]*[a-z0-9])?
    if (!VALID_NAME_REGEX.test(name)) {
        return {
            valid: false,
            error: "Package name must contain only lowercase alphanumeric characters, '-', and '_', and must start and end with an alphanumeric character",
        };
    }
    // Prevent consecutive hyphens/underscores which can cause visual spoofing
    if (name.includes("--") || name.includes("__") || name.includes("-_") || name.includes("_-")) {
        return { valid: false, error: "Package name cannot contain consecutive special characters ('--', '__', '-_')" };
    }
    return { valid: true };
}
/**
 * Canonicalizes and normalizes a package name.
 * Throws an error if the name violates security constraints.
 */
function normalizePackageName(rawName) {
    const result = validatePackageName(rawName);
    if (!result.valid) {
        throw new Error(`Invalid package name '${rawName}': ${result.error}`);
    }
    return rawName.trim().toLowerCase();
}
/**
 * Formats a canonical package identifier string: `name@version`.
 */
function formatPackageId(name, version) {
    const normName = normalizePackageName(name);
    return `${normName}@${version.trim()}`;
}
/**
 * Validates integrity string format: `sha256:<hex-digest>`.
 */
function validateIntegrity(integrity) {
    if (!integrity.startsWith("sha256:"))
        return false;
    const hash = integrity.slice(7);
    return /^[a-f0-9]{64}$/i.test(hash);
}
//# sourceMappingURL=identity.js.map