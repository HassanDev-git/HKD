import { describe, it, expect } from "@jest/globals";
import { resolveProfile, listProfiles, BUILD_PROFILES } from "../../src/deploy/profiles.js";

describe("Phase 14B — Production Build Profiles", () => {
  it("resolves default release profile", () => {
    const p = resolveProfile();
    expect(p.name).toBe("release");
    expect(p.optLevel).toBe(2);
    expect(p.enableAssertions).toBe(false);
    expect(p.pgoEnabled).toBe(false);
  });

  it("resolves debug profile with assertions and no optimizations", () => {
    const p = resolveProfile("debug");
    expect(p.name).toBe("debug");
    expect(p.optLevel).toBe(0);
    expect(p.enableAssertions).toBe(true);
    expect(p.stripSymbols).toBe(false);
  });

  it("resolves size profile with Oz optimization", () => {
    const p = resolveProfile("size");
    expect(p.name).toBe("size");
    expect(p.optLevel).toBe(2);
    expect(p.stripSymbols).toBe(true);
  });

  it("resolves speed profile with O3 and aggressive inlining", () => {
    const p = resolveProfile("speed");
    expect(p.name).toBe("speed");
    expect(p.optLevel).toBe(3);
    expect(p.inlineThreshold).toBeGreaterThanOrEqual(50);
  });

  it("resolves release-pgo profile with profile-guided optimization", () => {
    const p = resolveProfile("release-pgo");
    expect(p.name).toBe("release-pgo");
    expect(p.pgoEnabled).toBe(true);
  });

  it("throws diagnostic on unknown profile name", () => {
    expect(() => resolveProfile("ultra-turbo")).toThrow(/Unknown build profile/);
  });

  it("lists all available profiles", () => {
    const profiles = listProfiles();
    expect(profiles.length).toBe(5);
    expect(profiles.map((p) => p.name)).toEqual(
      expect.arrayContaining(["debug", "release", "size", "speed", "release-pgo"])
    );
  });
});
