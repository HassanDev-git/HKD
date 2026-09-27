"use strict";
/**
 * HKD Canonical Target Triple System
 *
 * Models target architecture, operating system, and ABI,
 * validating cross-compilation matrix before invocation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KNOWN_TARGETS = void 0;
exports.parseTarget = parseTarget;
exports.getHostTarget = getHostTarget;
exports.listTargetsFormatted = listTargetsFormatted;
exports.KNOWN_TARGETS = {
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
function parseTarget(tripleStr) {
    if (tripleStr === undefined || tripleStr === "host" || tripleStr === "native") {
        return getHostTarget();
    }
    const normalized = tripleStr.toLowerCase().trim();
    if (exports.KNOWN_TARGETS[normalized]) {
        return exports.KNOWN_TARGETS[normalized];
    }
    // Attempt to parse custom arch-os[-abi]
    const parts = normalized.split("-");
    if (parts.length === 2 || parts.length === 3) {
        const arch = parts[0];
        const os = parts[1];
        const abi = parts[2] || "none";
        const validAbis = ["msvc", "gnu", "musl", "none"];
        if (["x86_64", "aarch64", "x86", "arm"].includes(arch) &&
            ["windows", "linux", "macos"].includes(os) &&
            validAbis.includes(abi)) {
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
function getHostTarget() {
    const os = process.platform === "win32" ? "windows" : (process.platform === "darwin" ? "macos" : "linux");
    const arch = process.arch === "x64" ? "x86_64" : (process.arch === "arm64" ? "aarch64" : "x86_64");
    const key = `${arch}-${os}`;
    return exports.KNOWN_TARGETS[key] || {
        triple: key,
        arch,
        os,
        abi: os === "windows" ? "msvc" : (os === "linux" ? "gnu" : "none"),
        tier: "Tier 1 (Supported)",
        executableExtension: os === "windows" ? ".exe" : "",
    };
}
function listTargetsFormatted() {
    const host = getHostTarget();
    const lines = [
        "HKD Canonical Target Triples:\n",
        "  Target Triple        Tier                   Default ABI",
        "  ───────────────────  ─────────────────────  ───────────",
    ];
    const seen = new Set();
    for (const t of Object.values(exports.KNOWN_TARGETS)) {
        if (seen.has(t.triple))
            continue;
        seen.add(t.triple);
        const isHost = t.triple === host.triple ? " (host)" : "";
        lines.push(`  ${(t.triple + isHost).padEnd(21)}  ${t.tier.padEnd(23)}  ${t.abi}`);
    }
    return lines.join("\n");
}
//# sourceMappingURL=targets.js.map