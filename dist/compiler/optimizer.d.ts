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
import * as N from "../ast/nodes.js";
import { Chunk } from "../bytecode/chunk.js";
import { RegisterChunk } from "../bytecode/register_chunk.js";
import { OptimizationTier, ProfitabilityDecision } from "./profitability.js";
export interface OptimizationStats {
    passesAttempted: number;
    passesApplied: number;
    passesSkipped: number;
    constantsFolded: number;
    branchesSimplified: number;
    jumpsThreaded: number;
    deadInstructionsRemoved: number;
    movesEliminated: number;
    registerMovesRemoved: number;
    instructionsBefore: number;
    instructionsAfter: number;
    instructionDelta: number;
    registersBefore: number;
    registersAfter: number;
    optimizationTimeMs: number;
}
export interface OptimizerOptions {
    enabled?: boolean;
    tier?: OptimizationTier;
    constantFolding?: boolean;
    deadCodeElimination?: boolean;
    jumpThreading?: boolean;
    peephole?: boolean;
    registerOptimization?: boolean;
}
export declare class OptimizerPipeline {
    private stats;
    private options;
    private decision;
    constructor(options?: OptimizerOptions);
    getStats(): Readonly<OptimizationStats>;
    getDecision(): ProfitabilityDecision | null;
    resetStats(): void;
    /**
     * Pass 1: Optimize AST before bytecode emission.
     * Evaluates profitability; if small program fast path applies, skips AST pass.
     */
    optimizeAst(program: N.Program): N.Program;
    /**
     * Pass 2: Optimize stack-based bytecode Chunk.
     */
    optimizeChunk(chunk: Chunk): Chunk;
    /**
     * Pass 3: Optimize register-based bytecode RegisterChunk.
     */
    optimizeRegister(regChunk: RegisterChunk): RegisterChunk;
}
//# sourceMappingURL=optimizer.d.ts.map