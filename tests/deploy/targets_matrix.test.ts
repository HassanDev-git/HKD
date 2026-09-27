import { describe, it, expect } from "@jest/globals";
import { parseTarget, getHostTarget, KNOWN_TARGETS, TargetTriple } from "../../src/deploy/targets.js";

describe("Phase 14C Target Triple Exhaustive Matrix Tests", () => {
  const verifiedTriples = [
    "x86_64-windows",
    "x86_64-windows-msvc",
    "x86_64-linux",
    "x86_64-linux-gnu",
    "x86_64-linux-musl",
    "aarch64-macos",
    "aarch64-linux",
    "aarch64-linux-gnu",
  ];

  for (const triple of verifiedTriples) {
    it(`verifies canonical target triple: ${triple}`, () => {
      const parsed = parseTarget(triple);
      expect(parsed.triple).toBe(triple);
      expect(["x86_64", "aarch64"]).toContain(parsed.arch);
      expect(["windows", "linux", "macos"]).toContain(parsed.os);
      expect(["msvc", "gnu", "musl", "none"]).toContain(parsed.abi);
      expect(parsed.tier).toMatch(/Tier 1|Tier 2/);
    });
  }

  it("handles case-insensitivity in target strings", () => {
    expect(parseTarget("X86_64-WINDOWS").arch).toBe("x86_64");
    expect(parseTarget("X86_64-LINUX").os).toBe("linux");
    expect(parseTarget("AARCH64-MACOS").os).toBe("macos");
  });

  it("handles leading and trailing whitespace", () => {
    expect(parseTarget("  x86_64-linux  ").triple).toBe("x86_64-linux");
  });

  it("resolves alias 'host' to current host target", () => {
    const host = getHostTarget();
    expect(parseTarget("host")).toEqual(host);
  });

  it("resolves alias 'native' to current host target", () => {
    const host = getHostTarget();
    expect(parseTarget("native")).toEqual(host);
  });

  it("resolves undefined argument to current host target", () => {
    const host = getHostTarget();
    expect(parseTarget(undefined)).toEqual(host);
  });

  it("assigns .exe extension only for windows targets", () => {
    expect(parseTarget("x86_64-windows").executableExtension).toBe(".exe");
    expect(parseTarget("x86_64-windows-msvc").executableExtension).toBe(".exe");
    expect(parseTarget("x86_64-linux").executableExtension).toBe("");
    expect(parseTarget("aarch64-macos").executableExtension).toBe("");
  });

  it("supports experimental arm architecture triples with valid ABIs", () => {
    const armLinux = parseTarget("arm-linux-gnu");
    expect(armLinux.arch).toBe("arm");
    expect(armLinux.os).toBe("linux");
    expect(armLinux.abi).toBe("gnu");
    expect(armLinux.tier).toBe("Tier 2 (Experimental)");
  });

  it("supports experimental 32-bit x86 architecture triples", () => {
    const x86Win = parseTarget("x86-windows-msvc");
    expect(x86Win.arch).toBe("x86");
    expect(x86Win.os).toBe("windows");
    expect(x86Win.executableExtension).toBe(".exe");
  });

  it("rejects unknown architectures", () => {
    expect(() => parseTarget("sparc-linux-gnu")).toThrow(/Unsupported target/);
    expect(() => parseTarget("riscv64-linux-gnu")).toThrow(/Unsupported target/);
    expect(() => parseTarget("wasm32-unknown-unknown")).toThrow(/Unsupported target/);
  });

  it("rejects unknown operating systems", () => {
    expect(() => parseTarget("x86_64-freebsd")).toThrow(/Unsupported target/);
    expect(() => parseTarget("x86_64-netbsd")).toThrow(/Unsupported target/);
    expect(() => parseTarget("x86_64-android")).toThrow(/Unsupported target/);
  });

  it("rejects invalid ABIs", () => {
    expect(() => parseTarget("x86_64-linux-elf")).toThrow(/Unsupported target/);
    expect(() => parseTarget("x86_64-windows-macho")).toThrow(/Unsupported target/);
  });
});
