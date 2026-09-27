"use strict";
/**
 * HKD Shared Utilities
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HKD_VERSION = void 0;
exports.isAlpha = isAlpha;
exports.isDigit = isDigit;
exports.isIdentStart = isIdentStart;
exports.isIdentContinue = isIdentContinue;
exports.isHorizontalWhitespace = isHorizontalWhitespace;
exports.isWhitespace = isWhitespace;
exports.isHexDigit = isHexDigit;
exports.levenshtein = levenshtein;
exports.findClosestMatch = findClosestMatch;
exports.assert = assert;
exports.unreachable = unreachable;
// ─── String helpers ──────────────────────────────────────────────────────────
/** Returns true if the character is an ASCII letter. */
function isAlpha(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}
/** Returns true if the character is an ASCII digit. */
function isDigit(ch) {
    return ch >= "0" && ch <= "9";
}
/** Returns true if the character can start an identifier. */
function isIdentStart(ch) {
    return isAlpha(ch) || ch === "_";
}
/** Returns true if the character can continue an identifier. */
function isIdentContinue(ch) {
    return isAlpha(ch) || isDigit(ch) || ch === "_";
}
/** Returns true if the character is ASCII whitespace (but not newline). */
function isHorizontalWhitespace(ch) {
    return ch === " " || ch === "\t" || ch === "\r";
}
/** Returns true for any whitespace character. */
function isWhitespace(ch) {
    return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}
/** Returns true for a hex digit. */
function isHexDigit(ch) {
    return ((ch >= "0" && ch <= "9") ||
        (ch >= "a" && ch <= "f") ||
        (ch >= "A" && ch <= "F"));
}
// ─── Levenshtein distance (for "did you mean?" suggestions) ─────────────────
function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            }
            else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}
/**
 * Find the closest match to `name` among `candidates`.
 * Returns null if no candidate is close enough.
 */
function findClosestMatch(name, candidates, maxDistance = 3) {
    let best = null;
    let bestDist = Infinity;
    for (const candidate of candidates) {
        const dist = levenshtein(name, candidate);
        if (dist < bestDist && dist <= maxDistance) {
            bestDist = dist;
            best = candidate;
        }
    }
    return best;
}
// ─── Assertion helper ────────────────────────────────────────────────────────
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}
// ─── Unreachable marker ───────────────────────────────────────────────────────
function unreachable(x) {
    throw new Error(`Reached unreachable code with value: ${JSON.stringify(x)}`);
}
// ─── Version ─────────────────────────────────────────────────────────────────
exports.HKD_VERSION = "1.1.0";
__exportStar(require("./edition.js"), exports);
//# sourceMappingURL=index.js.map