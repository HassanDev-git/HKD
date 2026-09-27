"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUILD_PROFILES = void 0;
exports.resolveProfile = resolveProfile;
exports.listProfiles = listProfiles;
exports.BUILD_PROFILES = {
    debug: {
        name: "debug",
        optLevel: 0,
        inlineThreshold: 0,
        enableAssertions: true,
        stripSymbols: false,
        pgoEnabled: false,
        description: "Development build with full debug info and runtime assertions",
    },
    release: {
        name: "release",
        optLevel: 2,
        inlineThreshold: 20,
        enableAssertions: false,
        stripSymbols: true,
        pgoEnabled: false,
        description: "Standard production release with dead code elimination and inlining",
    },
    size: {
        name: "size",
        optLevel: 2,
        inlineThreshold: 5,
        enableAssertions: false,
        stripSymbols: true,
        pgoEnabled: false,
        description: "Optimized for smallest binary and bytecode footprint",
    },
    speed: {
        name: "speed",
        optLevel: 3,
        inlineThreshold: 50,
        enableAssertions: false,
        stripSymbols: true,
        pgoEnabled: false,
        description: "Maximum execution throughput with aggressive inlining and unrolling",
    },
    "release-pgo": {
        name: "release-pgo",
        optLevel: 3,
        inlineThreshold: 60,
        enableAssertions: false,
        stripSymbols: true,
        pgoEnabled: true,
        description: "Profile-Guided Optimization using runtime execution trace feedback",
    },
};
function resolveProfile(name) {
    if (name === undefined)
        return exports.BUILD_PROFILES.release;
    const key = name.toLowerCase().trim();
    const profile = exports.BUILD_PROFILES[key];
    if (!profile) {
        throw new Error(`Unknown build profile: '${name}'. Valid profiles: ${Object.keys(exports.BUILD_PROFILES).join(", ")}`);
    }
    return profile;
}
function listProfiles() {
    return Object.values(exports.BUILD_PROFILES);
}
//# sourceMappingURL=profiles.js.map