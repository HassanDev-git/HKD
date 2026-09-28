/**
 * HKD Compiler Optimization Pipeline (Phase 9D)
 *
 * Implements deterministic compiler optimization passes:
 *   1. AST Constant Folding & Propagation
 *   2. AST Branch & Loop Simplification
 *   3. Bytecode Jump Threading & Peephole Cleanup
 *   4. Register-Level Copy Propagation & Move Elimination
 */
import * as N from "../ast/nodes.js";
import { Chunk } from "../bytecode/chunk.js";
import { RegisterChunk } from "../bytecode/register_chunk.js";
export interface OptimizationStats {
    constantsFolded: number;
    branchesSimplified: number;
    jumpsThreaded: number;
    deadInstructionsRemoved: number;
    movesEliminated: number;
    registerMovesRemoved: number;
}
export interface OptimizerOptions {
    enabled?: boolean;
    constantFolding?: boolean;
    deadCodeElimination?: boolean;
    jumpThreading?: boolean;
    peephole?: boolean;
    registerOptimization?: boolean;
}
export declare class OptimizerPipeline {
    private stats;
    private options;
    constructor(options?: OptimizerOptions);
    getStats(): Readonly<OptimizationStats>;
    resetStats(): void;
    /**
     * Pass 1: Optimize AST before bytecode emission.
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