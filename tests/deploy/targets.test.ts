import { describe, it, expect } from "@jest/globals";
import { parseTarget, getHostTarget, listTargetsFormatted, KNOWN_TARGETS } from "../../src/deploy/targets.js";

describe("Phase 14C — Canonical Target Triple System", () => {
  it("resolves canonical host target correctly", () => {
    const host = getHostTarget();
    expect(host.arch).toMatch(/x86_64|aarch64/);
    expect(["windows", "linux", "macos"]).toContain(host.os);
    expect(host.tier).toBe("Tier 1 (Supported)");
  });

  it("parses known canonical triples", () => {
    const win = parseTarget("x86_64-windows");
    expect(win.arch).toBe("x86_64");
    expect(win.os).toBe("windows");
    expect(win.executableExtension).toBe(".exe");

    const linux = parseTarget("x86_64-linux");
    expect(linux.arch).toBe("x86_64");
    expect(linux.os).toBe("linux");
    expect(linux.executableExtension).toBe("");

    const mac = parseTarget("aarch64-macos");
    expect(mac.arch).toBe("aarch64");
    expect(mac.os).toBe("macos");
    expect(mac.tier).toBe("Tier 1 (Supported)");
  });

  it("parses experimental target triples with Tier 2 status", () => {
    const armLinux = parseTarget("aarch64-linux");
    expect(armLinux.tier).toBe("Tier 2 (Experimental)");
  });

  it("throws clear diagnostic on unsupported target triples", () => {
    expect(() => parseTarget("mips-solaris")).toThrow(/Unsupported target triple/);
  });

  it("formats target triple list table cleanly", () => {
    const text = listTargetsFormatted();
    expect(text).toContain("HKD Canonical Target Triples");
    expect(text).toContain("x86_64-windows");
    expect(text).toContain("x86_64-linux");
  });
});
