import { describe, test, expect } from "@jest/globals";
import {
  parseVersion,
  compareVersions,
  satisfies,
  selectHighestCompatible,
} from "../../src/package-manager/semver.js";

describe("HKD Phase 12C — Semantic Versioning Engine", () => {
  test("Parses standard SemVer 2.0.0 versions", () => {
    const v = parseVersion("1.2.3-alpha.1+build.123");
    expect(v.major).toBe(1);
    expect(v.minor).toBe(2);
    expect(v.patch).toBe(3);
    expect(v.prerelease).toEqual(["alpha", 1]);
    expect(v.build).toEqual(["build", "123"]);
  });

  test("Rejects malformed versions", () => {
    const invalid = ["1", "1.2", "v1.2.a", "1.2.3.4", "alpha", "", "1.0.0.0"];
    for (const inv of invalid) {
      expect(() => parseVersion(inv)).toThrow();
    }
  });

  test("Compares major, minor, and patch", () => {
    expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
    expect(compareVersions("2.1.0", "2.0.0")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.4")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  test("Compares prereleases according to SemVer 2.0 precedence", () => {
    // Normal version has higher precedence than prerelease
    expect(compareVersions("1.0.0", "1.0.0-alpha")).toBe(1);
    expect(compareVersions("1.0.0-alpha", "1.0.0")).toBe(-1);

    // Sequence: 1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0
    const sequence = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
    ];

    for (let i = 0; i < sequence.length - 1; i++) {
      expect(compareVersions(sequence[i], sequence[i + 1])).toBe(-1);
      expect(compareVersions(sequence[i + 1], sequence[i])).toBe(1);
    }
  });

  test("Ignores build metadata in comparison", () => {
    expect(compareVersions("1.0.0+001", "1.0.0+20130313144700")).toBe(0);
  });

  test("Caret ranges (^)", () => {
    expect(satisfies("1.2.3", "^1.2.0")).toBe(true);
    expect(satisfies("1.9.9", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.1.9", "^1.2.0")).toBe(false);

    // ^0.2.3
    expect(satisfies("0.2.4", "^0.2.3")).toBe(true);
    expect(satisfies("0.3.0", "^0.2.3")).toBe(false);

    // ^0.0.3
    expect(satisfies("0.0.3", "^0.0.3")).toBe(true);
    expect(satisfies("0.0.4", "^0.0.3")).toBe(false);
  });

  test("Tilde ranges (~)", () => {
    expect(satisfies("1.2.3", "~1.2.0")).toBe(true);
    expect(satisfies("1.2.9", "~1.2.0")).toBe(true);
    expect(satisfies("1.3.0", "~1.2.0")).toBe(false);
  });

  test("Relational ranges and compound constraints", () => {
    expect(satisfies("1.5.0", ">=1.0.0 <2.0.0")).toBe(true);
    expect(satisfies("2.0.0", ">=1.0.0 <2.0.0")).toBe(false);
    expect(satisfies("0.9.0", ">=1.0.0 <2.0.0")).toBe(false);
  });

  test("Wildcards (1.x, *)", () => {
    expect(satisfies("1.5.2", "1.x")).toBe(true);
    expect(satisfies("2.0.0", "1.x")).toBe(false);
    expect(satisfies("5.4.1", "*")).toBe(true);
    expect(satisfies("1.0.0", "latest")).toBe(true);
  });

  test("Disjunctive OR ranges (||)", () => {
    expect(satisfies("1.2.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfies("2.5.0", "^1.0.0 || ^2.0.0")).toBe(true);
    expect(satisfies("3.0.0", "^1.0.0 || ^2.0.0")).toBe(false);
  });

  test("selectHighestCompatible picks the greatest matching version", () => {
    const versions = ["1.0.0", "1.1.0", "1.2.0", "1.2.5", "2.0.0", "2.1.0-alpha.1"];

    expect(selectHighestCompatible(versions, "^1.0.0")).toBe("1.2.5");
    expect(selectHighestCompatible(versions, ">=2.0.0")).toBe("2.0.0");
    expect(selectHighestCompatible(versions, "^3.0.0")).toBeNull();
  });
});
