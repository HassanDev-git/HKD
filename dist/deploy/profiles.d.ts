/**
 * HKD Build Profiles Engine
 *
 * Defines deterministic compiler and runtime optimization profiles:
 * - debug: Full symbols, assertions enabled, no inlining
 * - release: Standard production optimizations, assertions stripped
 * - size: Bytecode compaction, dead code elimination, minimal metadata
 * - speed: Aggressive inlining, loop unrolling, type specialization
 * - release-pgo: Profile-Guided Optimization with branch weights
 */
export type BuildProfileName = "debug" | "release" | "size" | "speed" | "release-pgo";
export interface BuildProfile {
    name: BuildProfileName;
    optLevel: 0 | 1 | 2 | 3;
    inlineThreshold: number;
    enableAssertions: boolean;
    stripSymbols: boolean;
    pgoEnabled: boolean;
    description: string;
}
export declare const BUILD_PROFILES: Record<BuildProfileName, BuildProfile>;
export declare function resolveProfile(name?: string): BuildProfile;
export declare function listProfiles(): BuildProfile[];
//# sourceMappingURL=profiles.d.ts.map