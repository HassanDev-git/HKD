/**
 * HKD MIR Optimizer 2.0
 *
 * Implements multi-pass compiler optimizations on SSA-ready MIR:
 * 1. Constant Folding & Constant Propagation
 * 2. Copy Propagation
 * 3. Algebraic Simplification (x + 0 -> x, x * 1 -> x, x * 0 -> 0)
 * 4. Common Subexpression Elimination (CSE)
 * 5. Dead Code Elimination (DCE) & Dead Store Elimination
 * 6. Jump Threading & Block Simplification
 */
import { ControlFlowGraph, VReg, MIRFunction } from "./mir.js";
export interface OptimizationStats {
    foldedConstants: number;
    propagatedConstants: number;
    copiesPropagated: number;
    algebraicSimplifications: number;
    commonSubexpressionsEliminated: number;
    eliminatedInstructions: number;
    eliminatedBlocks: number;
    threadedJumps: number;
    hoistedLoopInvariants: number;
    scalarReplacements: number;
    inlinedCalls: number;
    reorderedBranches: number;
}
export declare class MIROptimizer {
    stats: OptimizationStats;
    optimize(cfg: ControlFlowGraph): ControlFlowGraph;
    /**
     * Pass 1: Constant Folding and Propagation
     */
    private runConstantFoldingAndPropagation;
    /**
     * Pass 2: Copy Propagation
     * If %dst = Copy %src, forward %src to subsequent uses of %dst within the block.
     */
    private runCopyPropagation;
    /**
     * Pass 3: Algebraic Simplification
     * x + 0 -> x, x - 0 -> x, x * 1 -> x, x * 0 -> 0, x / 1 -> x
     */
    private runAlgebraicSimplification;
    /**
     * Pass 4: Common Subexpression Elimination (CSE)
     * Detects duplicate calculations within a block and reuses the earlier result.
     */
    private runCommonSubexpressionElimination;
    private propagateOperands;
    private evalBinary;
    private evalUnary;
    /**
     * Pass 5: Dead Code Elimination (DCE) & Dead Store Elimination
     */
    private runDeadCodeElimination;
    private collectUsedRegs;
    /**
     * Pass 6: Jump Threading
     */
    private runJumpThreading;
    /**
     * Pass 7: Loop Invariant Code Motion (LICM) & Strength Reduction
     */
    runLoopOptimizations(cfg: ControlFlowGraph): boolean;
    /**
     * Pass 8: Escape Analysis & Scalar Replacement of Aggregates (SROA)
     */
    runEscapeAnalysisAndSROA(cfg: ControlFlowGraph): boolean;
    /**
     * Pass 9: Controlled Function Inlining
     */
    runFunctionInlining(functions: Map<string, MIRFunction>): boolean;
    /**
     * Pass 10: Branch & Control-Flow Optimization (Hot Fallthrough & Cold Block Placement)
     */
    runBranchAndControlFlowOptimization(cfg: ControlFlowGraph): boolean;
    /**
     * Linear Scan Register Allocator over x86_64 Physical Registers
     */
    allocateRegistersLinearScan(cfg: ControlFlowGraph): Map<VReg, {
        physReg?: string;
        spillSlot?: number;
    }>;
}
//# sourceMappingURL=optimizer.d.ts.map