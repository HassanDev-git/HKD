"use strict";
/**
 * HKD Compiler Optimization Pipeline (Phase 9E Refinement)
 *
 * Implements deterministic, profitability-aware compiler optimization:
 *   1. Rapid AST Complexity & Profitability Assessment
 *   2. Small Program Fast Path
 *   3. Selective AST Constant Folding & Safe Propagation
 *   4. AST Branch & Loop Simplification within Budget
 *   5. Register-Level Chained Move Elimination, Source Forwarding & Cleanup
 *   6. Comprehensive Metrics & Pass Statistics Tracking
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizerPipeline = void 0;
const optimizer_passes_js_1 = require("./optimizer_passes.js");
const profitability_js_1 = require("./profitability.js");
class OptimizerPipeline {
    stats = {
        passesAttempted: 0,
        passesApplied: 0,
        passesSkipped: 0,
        constantsFolded: 0,
        branchesSimplified: 0,
        jumpsThreaded: 0,
        deadInstructionsRemoved: 0,
        movesEliminated: 0,
        registerMovesRemoved: 0,
        instructionsBefore: 0,
        instructionsAfter: 0,
        instructionDelta: 0,
        registersBefore: 0,
        registersAfter: 0,
        optimizationTimeMs: 0,
    };
    options;
    decision = null;
    constructor(options = {}) {
        this.options = {
            enabled: options.enabled !== undefined ? options.enabled : (process.env.HKD_OPT_ENABLED !== "0"),
            tier: options.tier ?? profitability_js_1.OptimizationTier.Tier1_Structural,
            constantFolding: options.constantFolding !== undefined ? options.constantFolding : (process.env.HKD_OPT_CONST_FOLD !== "0"),
            deadCodeElimination: options.deadCodeElimination !== undefined ? options.deadCodeElimination : (process.env.HKD_OPT_DCE !== "0"),
            jumpThreading: options.jumpThreading !== undefined ? options.jumpThreading : (process.env.HKD_OPT_JUMP_THREAD !== "0"),
            peephole: options.peephole !== undefined ? options.peephole : (process.env.HKD_OPT_PEEPHOLE !== "0"),
            registerOptimization: options.registerOptimization !== undefined ? options.registerOptimization : (process.env.HKD_OPT_REG_OPT !== "0"),
        };
    }
    getStats() {
        return { ...this.stats };
    }
    getDecision() {
        return this.decision;
    }
    resetStats() {
        this.stats = {
            passesAttempted: 0,
            passesApplied: 0,
            passesSkipped: 0,
            constantsFolded: 0,
            branchesSimplified: 0,
            jumpsThreaded: 0,
            deadInstructionsRemoved: 0,
            movesEliminated: 0,
            registerMovesRemoved: 0,
            instructionsBefore: 0,
            instructionsAfter: 0,
            instructionDelta: 0,
            registersBefore: 0,
            registersAfter: 0,
            optimizationTimeMs: 0,
        };
    }
    /**
     * Pass 1: Optimize AST before bytecode emission.
     * Evaluates profitability; if small program fast path applies, skips AST pass.
     */
    optimizeAst(program) {
        if (!this.options.enabled)
            return program;
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        this.stats.passesAttempted++;
        const metrics = (0, profitability_js_1.analyzeAstProfitability)(program);
        this.decision = (0, profitability_js_1.computeProfitabilityDecision)(metrics, this.options.tier);
        if (!this.decision.enableAstPass || !this.options.constantFolding) {
            this.stats.passesSkipped++;
            return program;
        }
        this.stats.passesApplied++;
        const optimized = (0, optimizer_passes_js_1.foldAstConstants)(program, this.stats, {
            ...this.options,
            constantFolding: this.decision.enableAstPass,
            deadCodeElimination: this.decision.enableDce && this.options.deadCodeElimination,
        });
        if (t0 > 0) {
            this.stats.optimizationTimeMs += performance.now() - t0;
        }
        return optimized;
    }
    /**
     * Pass 2: Optimize stack-based bytecode Chunk.
     */
    optimizeChunk(chunk) {
        if (!this.options.enabled)
            return chunk;
        return (0, optimizer_passes_js_1.optimizeBytecodeChunk)(chunk, this.stats, this.options);
    }
    /**
     * Pass 3: Optimize register-based bytecode RegisterChunk.
     */
    optimizeRegister(regChunk) {
        if (!this.options.enabled || !this.options.registerOptimization)
            return regChunk;
        const t0 = typeof performance !== "undefined" ? performance.now() : 0;
        this.stats.passesAttempted++;
        this.stats.passesApplied++;
        this.stats.instructionsBefore += regChunk.code.length;
        this.stats.registersBefore = Math.max(this.stats.registersBefore, regChunk.registerCount);
        const optimized = (0, optimizer_passes_js_1.optimizeRegisterChunk)(regChunk, this.stats, this.options);
        this.stats.instructionsAfter += optimized.code.length;
        this.stats.instructionDelta = this.stats.instructionsBefore - this.stats.instructionsAfter;
        this.stats.registersAfter = Math.max(this.stats.registersAfter, optimized.registerCount);
        if (t0 > 0) {
            this.stats.optimizationTimeMs += performance.now() - t0;
        }
        return optimized;
    }
}
exports.OptimizerPipeline = OptimizerPipeline;
//# sourceMappingURL=optimizer.js.map