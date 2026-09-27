/**
 * HKD Shared Utilities
 */
/** Returns true if the character is an ASCII letter. */
export declare function isAlpha(ch: string): boolean;
/** Returns true if the character is an ASCII digit. */
export declare function isDigit(ch: string): boolean;
/** Returns true if the character can start an identifier. */
export declare function isIdentStart(ch: string): boolean;
/** Returns true if the character can continue an identifier. */
export declare function isIdentContinue(ch: string): boolean;
/** Returns true if the character is ASCII whitespace (but not newline). */
export declare function isHorizontalWhitespace(ch: string): boolean;
/** Returns true for any whitespace character. */
export declare function isWhitespace(ch: string): boolean;
/** Returns true for a hex digit. */
export declare function isHexDigit(ch: string): boolean;
export declare function levenshtein(a: string, b: string): number;
/**
 * Find the closest match to `name` among `candidates`.
 * Returns null if no candidate is close enough.
 */
export declare function findClosestMatch(name: string, candidates: string[], maxDistance?: number): string | null;
export declare function assert(condition: boolean, message: string): asserts condition;
export declare function unreachable(x: never): never;
export declare const HKD_VERSION = "1.1.0";
export * from "./edition.js";
//# sourceMappingURL=index.d.ts.map