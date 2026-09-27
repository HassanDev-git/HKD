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
  comparators: Comparator[][]; // Disjunctive normal form (OR of ANDs)
}

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

/**
 * Parses a semantic version string into a SemVer object.
 * Throws an error if the version string does not conform to SemVer 2.0.0.
 */
export function parseVersion(raw: string): SemVer {
  const trimmed = raw.trim();
  const match = trimmed.match(SEMVER_REGEX);
  if (!match) {
    throw new Error(`Invalid semantic version: '${raw}'`);
  }

  const major = parseInt(match[1], 10);
  const minor = parseInt(match[2], 10);
  const patch = parseInt(match[3], 10);

  const prerelease: (string | number)[] = [];
  if (match[4]) {
    const parts = match[4].split(".");
    for (const part of parts) {
      if (part.length === 0) {
        throw new Error(`Invalid semantic version: empty prerelease identifier in '${raw}'`);
      }
      if (/^\d+$/.test(part)) {
        if (part.length > 1 && part.startsWith("0")) {
          throw new Error(`Invalid semantic version: leading zero in numeric prerelease identifier '${part}' in '${raw}'`);
        }
        prerelease.push(parseInt(part, 10));
      } else {
        prerelease.push(part);
      }
    }
  }

  const build: string[] = [];
  if (match[5]) {
    const parts = match[5].split(".");
    for (const part of parts) {
      if (part.length === 0) {
        throw new Error(`Invalid semantic version: empty build identifier in '${raw}'`);
      }
      build.push(part);
    }
  }

  return {
    major,
    minor,
    patch,
    prerelease,
    build,
    raw: trimmed,
  };
}

/**
 * Compares two SemVer instances or version strings according to SemVer 2.0.0 precedence.
 * Returns:
 *   -1 if a < b
 *    0 if a == b
 *    1 if a > b
 */
export function compareVersions(aInput: SemVer | string, bInput: SemVer | string): number {
  const a = typeof aInput === "string" ? parseVersion(aInput) : aInput;
  const b = typeof bInput === "string" ? parseVersion(bInput) : bInput;

  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // Prerelease comparison:
  // Normal version has higher precedence than prerelease
  const aPre = a.prerelease.length > 0;
  const bPre = b.prerelease.length > 0;

  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (!aPre && !bPre) return 0;

  // Both have prereleases: compare identifier by identifier
  const minLen = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < minLen; i++) {
    const idA = a.prerelease[i];
    const idB = b.prerelease[i];

    if (idA === idB) continue;

    const aNum = typeof idA === "number";
    const bNum = typeof idB === "number";

    // Numeric identifiers always have lower precedence than non-numeric
    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;

    if (aNum && bNum) {
      return (idA as number) > (idB as number) ? 1 : -1;
    } else {
      return (idA as string).localeCompare(idB as string) > 0 ? 1 : -1;
    }
  }

  if (a.prerelease.length !== b.prerelease.length) {
    return a.prerelease.length > b.prerelease.length ? 1 : -1;
  }

  return 0;
}

/**
 * Parses a single version constraint token (e.g. `^1.2.3`, `>=1.0.0`, `1.x`, `*`).
 */
function parseSimpleComparator(token: string): Comparator[] {
  const t = token.trim();
  if (!t || t === "*" || t === "latest") {
    return [{ op: ">=", version: parseVersion("0.0.0") }];
  }

  // Caret: ^1.2.3
  if (t.startsWith("^")) {
    const v = parseVersion(t.slice(1));
    if (v.major > 0) {
      return [
        { op: ">=", version: v },
        { op: "<", version: { ...v, major: v.major + 1, minor: 0, patch: 0, prerelease: [], build: [], raw: `${v.major + 1}.0.0` } },
      ];
    } else if (v.minor > 0) {
      return [
        { op: ">=", version: v },
        { op: "<", version: { ...v, minor: v.minor + 1, patch: 0, prerelease: [], build: [], raw: `0.${v.minor + 1}.0` } },
      ];
    } else {
      return [
        { op: ">=", version: v },
        { op: "<", version: { ...v, patch: v.patch + 1, prerelease: [], build: [], raw: `0.0.${v.patch + 1}` } },
      ];
    }
  }

  // Tilde: ~1.2.3
  if (t.startsWith("~")) {
    const v = parseVersion(t.slice(1));
    return [
      { op: ">=", version: v },
      { op: "<", version: { ...v, minor: v.minor + 1, patch: 0, prerelease: [], build: [], raw: `${v.major}.${v.minor + 1}.0` } },
    ];
  }

  // Wildcard: 1.x or 1.2.x
  if (t.endsWith(".x") || t.endsWith(".*")) {
    const parts = t.slice(0, -2).split(".");
    if (parts.length === 1) {
      const major = parseInt(parts[0], 10);
      const minV = parseVersion(`${major}.0.0`);
      const maxV = parseVersion(`${major + 1}.0.0`);
      return [{ op: ">=", version: minV }, { op: "<", version: maxV }];
    } else if (parts.length === 2) {
      const major = parseInt(parts[0], 10);
      const minor = parseInt(parts[1], 10);
      const minV = parseVersion(`${major}.${minor}.0`);
      const maxV = parseVersion(`${major}.${minor + 1}.0`);
      return [{ op: ">=", version: minV }, { op: "<", version: maxV }];
    }
  }

  // >=, <=, >, <, =
  if (t.startsWith(">=")) return [{ op: ">=", version: parseVersion(t.slice(2)) }];
  if (t.startsWith("<=")) return [{ op: "<=", version: parseVersion(t.slice(2)) }];
  if (t.startsWith(">"))  return [{ op: ">",  version: parseVersion(t.slice(1)) }];
  if (t.startsWith("<"))  return [{ op: "<",  version: parseVersion(t.slice(1)) }];
  if (t.startsWith("="))  return [{ op: "=",  version: parseVersion(t.slice(1)) }];

  // Exact version
  return [{ op: "=", version: parseVersion(t) }];
}

/**
 * Parses a full version range expression including compound ANDs and ORs (`||`).
 * Examples: `>=1.0.0 <2.0.0`, `^1.2.0 || ^2.0.0`.
 */
export function parseRange(rangeStr: string): VersionRange {
  const trimmed = rangeStr.trim();
  if (!trimmed || trimmed === "*" || trimmed === "latest") {
    return {
      raw: trimmed,
      comparators: [[{ op: ">=", version: parseVersion("0.0.0") }]],
    };
  }

  // Split by OR: `||`
  const orClauses = trimmed.split(/\s*\|\|\s*/);
  const comparators: Comparator[][] = [];

  for (const clause of orClauses) {
    const andTokens = clause.trim().split(/\s+/);
    const clauseComparators: Comparator[] = [];
    for (const token of andTokens) {
      const comps = parseSimpleComparator(token);
      clauseComparators.push(...comps);
    }
    if (clauseComparators.length > 0) {
      comparators.push(clauseComparators);
    }
  }

  return {
    raw: trimmed,
    comparators,
  };
}

/**
 * Evaluates whether a SemVer version satisfies a specific Comparator.
 */
function testComparator(v: SemVer, c: Comparator): boolean {
  const cmp = compareVersions(v, c.version);
  switch (c.op) {
    case "=":  return cmp === 0;
    case ">":  return cmp > 0;
    case ">=": return cmp >= 0;
    case "<":  return cmp < 0;
    case "<=": return cmp <= 0;
    default:   return false;
  }
}

/**
 * Checks if a version satisfies a given version range constraint.
 */
export function satisfies(version: string | SemVer, rangeStr: string | VersionRange): boolean {
  const v = typeof version === "string" ? parseVersion(version) : version;
  const range = typeof rangeStr === "string" ? parseRange(rangeStr) : rangeStr;

  // Satisfied if ANY OR clause is satisfied
  return range.comparators.some((andClause) => {
    // Satisfied if ALL AND comparators are satisfied
    const matchesAll = andClause.every((comp) => testComparator(v, comp));
    if (!matchesAll) return false;

    // Prerelease rule: if version has prerelease, only match if comparator also specifies a prerelease on same tuple
    if (v.prerelease.length > 0) {
      return andClause.some(
        (comp) =>
          comp.version.prerelease.length > 0 &&
          comp.version.major === v.major &&
          comp.version.minor === v.minor &&
          comp.version.patch === v.patch
      );
    }

    return true;
  });
}

/**
 * Selects the highest compatible version from a list of available versions for a range.
 * Returns null if no compatible version is found.
 */
export function selectHighestCompatible(versions: string[], range: string): string | null {
  const parsedRange = parseRange(range);
  const candidates: SemVer[] = [];

  for (const verStr of versions) {
    try {
      const v = parseVersion(verStr);
      if (satisfies(v, parsedRange)) {
        candidates.push(v);
      }
    } catch {
      // Ignore unparseable version strings in candidates
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => compareVersions(a, b));
  return candidates[candidates.length - 1].raw;
}
