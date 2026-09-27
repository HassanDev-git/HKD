/**
 * HKD Canonical Target Triple System
 *
 * Models target architecture, operating system, and ABI,
 * validating cross-compilation matrix before invocation.
 */

export type Arch = "x86_64" | "aarch64" | "x86" | "arm";
export type OS = "windows" | "linux" | "macos";
export type Abi = "msvc" | "gnu" | "musl" | "none";
export type TargetTier = "Tier 1 (Supported)" | "Tier 2 (Experimental)" | "Unsupported";

export interface TargetTriple {
  triple: string;
  arch: Arch;
  os: OS;
  abi: Abi;
  tier: TargetTier;
  executableExtension: string;
}

export const KNOWN_TARGETS: Record<string, TargetTriple> = {
  "x86_64-windows": {
    triple: "x86_64-windows",
    arch: "x86_64",
    os: "windows",
    abi: "msvc",
    tier: "Tier 1 (Supported)",
    executableExtension: ".exe",
  },
  "x86_64-windows-msvc": {
    triple: "x86_64-windows-msvc",
    arch: "x86_64",
    os: "windows",
    abi: "msvc",
    tier: "Tier 1 (Supported)",
    executableExtension: ".exe",
  },
  "x86_64-linux": {
    triple: "x86_64-linux",
    arch: "x86_64",
    os: "linux",
    abi: "gnu",
    tier: "Tier 1 (Supported)",
    executableExtension: "",
  },
  "x86_64-linux-gnu": {
    triple: "x86_64-linux-gnu",
    arch: "x86_64",
    os: "linux",
    abi: "gnu",
    tier: "Tier 1 (Supported)",
    executableExtension: "",
  },
  "x86_64-linux-musl": {
    triple: "x86_64-linux-musl",
    arch: "x86_64",
    os: "linux",
    abi: "musl",
    tier: "Tier 1 (Supported)",
    executableExtension: "",
  },
  "aarch64-macos": {
    triple: "aarch64-macos",
    arch: "aarch64",
    os: "macos",
    abi: "none",
    tier: "Tier 1 (Supported)",
    executableExtension: "",
  },
  "aarch64-linux": {
    triple: "aarch64-linux",
    arch: "aarch64",
    os: "linux",
    abi: "gnu",
    tier: "Tier 2 (Experimental)",
    executableExtension: "",
  },
  "aarch64-linux-gnu": {
    triple: "aarch64-linux-gnu",
    arch: "aarch64",
    os: "linux",
    abi: "gnu",
    tier: "Tier 2 (Experimental)",
    executableExtension: "",
  },
};

export function parseTarget(tripleStr?: string): TargetTriple {
  if (tripleStr === undefined || tripleStr === "host" || tripleStr === "native") {
    return getHostTarget();
  }

  const normalized = tripleStr.toLowerCase().trim();
  if (KNOWN_TARGETS[normalized]) {
    return KNOWN_TARGETS[normalized];
  }

  // Attempt to parse custom arch-os[-abi]
  const parts = normalized.split("-");
  if (parts.length === 2 || parts.length === 3) {
    const arch = parts[0] as Arch;
    const os = parts[1] as OS;
    const abi = (parts[2] as Abi) || "none";
    const validAbis: Abi[] = ["msvc", "gnu", "musl", "none"];
    if (
      ["x86_64", "aarch64", "x86", "arm"].includes(arch) &&
      ["windows", "linux", "macos"].includes(os) &&
      validAbis.includes(abi)
    ) {
      return {
        triple: normalized,
        arch,
        os,
        abi,
        tier: "Tier 2 (Experimental)",
        executableExtension: os === "windows" ? ".exe" : "",
      };
    }
  }

  throw new Error(`Unsupported target triple: '${tripleStr}'. Run 'hkd targets' to list verified targets.`);
}

export function getHostTarget(): TargetTriple {
  const os = process.platform === "win32" ? "windows" : (process.platform === "darwin" ? "macos" : "linux");
  const arch = process.arch === "x64" ? "x86_64" : (process.arch === "arm64" ? "aarch64" : "x86_64");
  const key = `${arch}-${os}`;
  return KNOWN_TARGETS[key] || {
    triple: key,
    arch,
    os,
    abi: os === "windows" ? "msvc" : (os === "linux" ? "gnu" : "none"),
    tier: "Tier 1 (Supported)",
    executableExtension: os === "windows" ? ".exe" : "",
  };
}

export function listTargetsFormatted(): string {
  const host = getHostTarget();
  const lines: string[] = [
    "HKD Canonical Target Triples:\n",
    "  Target Triple        Tier                   Default ABI",
    "  ───────────────────  ─────────────────────  ───────────",
  ];

  const seen = new Set<string>();
  for (const t of Object.values(KNOWN_TARGETS)) {
    if (seen.has(t.triple)) continue;
    seen.add(t.triple);
    const isHost = t.triple === host.triple ? " (host)" : "";
    lines.push(`  ${(t.triple + isHost).padEnd(21)}  ${t.tier.padEnd(23)}  ${t.abi}`);
  }

  return lines.join("\n");
}
