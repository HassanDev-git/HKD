/**
 * HKD Shared Utilities
 */

// ─── String helpers ──────────────────────────────────────────────────────────

/** Returns true if the character is an ASCII letter. */
export function isAlpha(ch: string): boolean {
  return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z");
}

/** Returns true if the character is an ASCII digit. */
export function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

/** Returns true if the character can start an identifier. */
export function isIdentStart(ch: string): boolean {
  return isAlpha(ch) || ch === "_";
}

/** Returns true if the character can continue an identifier. */
export function isIdentContinue(ch: string): boolean {
  return isAlpha(ch) || isDigit(ch) || ch === "_";
}

/** Returns true if the character is ASCII whitespace (but not newline). */
export function isHorizontalWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r";
}

/** Returns true for any whitespace character. */
export function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\r" || ch === "\n";
}

/** Returns true for a hex digit. */
export function isHexDigit(ch: string): boolean {
  return (
    (ch >= "0" && ch <= "9") ||
    (ch >= "a" && ch <= "f") ||
    (ch >= "A" && ch <= "F")
  );
}

// ─── Levenshtein distance (for "did you mean?" suggestions) ─────────────────

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
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
export function findClosestMatch(
  name: string,
  candidates: string[],
  maxDistance = 3
): string | null {
  let best: string | null = null;
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

export function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// ─── Unreachable marker ───────────────────────────────────────────────────────

export function unreachable(x: never): never {
  throw new Error(`Reached unreachable code with value: ${JSON.stringify(x)}`);
}

// ─── Version ─────────────────────────────────────────────────────────────────

export const HKD_VERSION = "1.1.0";

export * from "./edition.js";

