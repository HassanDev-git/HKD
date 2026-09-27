/**
 * HKD Semantic Versioning (SemVer 2.0.0) Engine
 *
 * Implements full SemVer 2.0 parsing, comparison, constraint ranges,
 * and highest-compatible version selection.
 */
export interface SemVer {
    major: number;
    minor: number;
    patch: number;
    prerelease: (string | number)[];
    build: string[];
    raw: string;
}
export type ComparatorOp = "=" | ">" | ">=" | "<" | "<=" | "^" | "~";
export interface Comparator {
    op: ComparatorOp;
    version: SemVer;
}
export interface VersionRange {
    raw: string;
    comparators: Comparator[][];
}
/**
 * Parses a semantic version string into a SemVer object.
 * Throws an error if the version string does not conform to SemVer 2.0.0.
 */
export declare function parseVersion(raw: string): SemVer;
/**
 * Compares two SemVer instances or version strings according to SemVer 2.0.0 precedence.
 * Returns:
 *   -1 if a < b
 *    0 if a == b
 *    1 if a > b
 */
export declare function compareVersions(aInput: SemVer | string, bInput: SemVer | string): number;
/**
 * Parses a full version range expression including compound ANDs and ORs (`||`).
 * Examples: `>=1.0.0 <2.0.0`, `^1.2.0 || ^2.0.0`.
 */
export declare function parseRange(rangeStr: string): VersionRange;
/**
 * Checks if a version satisfies a given version range constraint.
 */
export declare function satisfies(version: string | SemVer, rangeStr: string | VersionRange): boolean;
/**
 * Selects the highest compatible version from a list of available versions for a range.
 * Returns null if no compatible version is found.
 */
export declare function selectHighestCompatible(versions: string[], range: string): string | null;
//# sourceMappingURL=semver.d.ts.map