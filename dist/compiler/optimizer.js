"use strict";
/**
 * HKD Compiler Optimization Pipeline (Phase 9D)
 *
 * Implements deterministic compiler optimization passes:
 *   1. AST Constant Folding & Propagation
 *   2. AST Branch & Loop Simplification
 *   3. Bytecode Jump Threading & Peephole Cleanup
 *   4. Register-Level Copy Propagation & Move Elimination
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizerPipeline = void 0;
const optimizer_passes_js_1 = require("./optimizer_passes.js");
class OptimizerPipeline {
    stats = {
        constantsFolded: 0,
        branchesSimplified: 0,
        jumpsThreaded: 0,
        deadInstructionsRemoved: 0,
        movesEliminated: 0,
        registerMovesRemoved: 0,
    };
    options;
    constructor(options = {}) {
        this.options = {
            enabled: options.enabled !== undefined ? options.enabled : (process.env.HKD_OPT_ENABLED !== "0"),
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
    resetStats() {
        this.stats = {
            constantsFolded: 0,
            branchesSimplified: 0,
            jumpsThreaded: 0,
            deadInstructionsRemoved: 0,
            movesEliminated: 0,
            registerMovesRemoved: 0,
        };
    }
    /**
     * Pass 1: Optimize AST before bytecode emission.
     */
    optimizeAst(program) {
        if (!this.options.enabled)
            return program;
        return (0, optimizer_passes_js_1.foldAstConstants)(program, this.stats, this.options);
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
        return (0, optimizer_passes_js_1.optimizeRegisterChunk)(regChunk, this.stats, this.options);
    }
}
exports.OptimizerPipeline = OptimizerPipeline;
//# sourceMappingURL=optimizer.js.map