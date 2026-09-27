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
export declare const KNOWN_TARGETS: Record<string, TargetTriple>;
export declare function parseTarget(tripleStr?: string): TargetTriple;
export declare function getHostTarget(): TargetTriple;
export declare function listTargetsFormatted(): string;
//# sourceMappingURL=targets.d.ts.map