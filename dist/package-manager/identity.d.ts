/**
 * HKD Package Identity & Canonical Naming Rules
 *
 * Enforces strict validation and canonical normalization across all package
 * references, preventing path traversal, registry confusion, reserved collisions,
 * and malformed identifiers.
 */
export interface PackageIdentity {
    name: string;
    version: string;
    source: string;
    integrity: string;
}
export interface ValidationResult {
    valid: boolean;
    error?: string;
}
/**
 * Validates whether a given package name adheres to HKD package security rules.
 */
export declare function validatePackageName(rawName: string): ValidationResult;
/**
 * Canonicalizes and normalizes a package name.
 * Throws an error if the name violates security constraints.
 */
export declare function normalizePackageName(rawName: string): string;
/**
 * Formats a canonical package identifier string: `name@version`.
 */
export declare function formatPackageId(name: string, version: string): string;
/**
 * Validates integrity string format: `sha256:<hex-digest>`.
 */
export declare function validateIntegrity(integrity: string): boolean;
//# sourceMappingURL=identity.d.ts.map