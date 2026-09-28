/**
 * HKD Optimization Profitability & Cost Model (Phase 9E)
 *
 * Provides compile-time cost/benefit heuristics, optimization tiers,
 * budget tracking, and small-program fast-path detection.
 */
import * as N from "../ast/nodes.js";
export declare enum OptimizationTier {
    Tier0_AlwaysCheap = 0,// Inlined peephole, self-moves, trivial fold
    Tier1_Structural = 1,// Move chaining, source forwarding, jump threading
    Tier2_Expensive = 2
}
export interface ProgramComplexityMetrics {
    statementCount: number;
    expressionCount: number;
    functionCount: number;
    loopCount: number;
    branchCount: number;
    hasMutations: boolean;
    hasAsync: boolean;
    hasFoldableCandidates: boolean;
    estimatedComplexity: number;
    budget: number;
}
export interface ProfitabilityDecision {
    isSmallProgram: boolean;
    allowedTier: OptimizationTier;
    enableAstPass: boolean;
    enableDce: boolean;
    enableRegisterOpt: boolean;
    budget: number;
    metrics: ProgramComplexityMetrics;
}
/**
 * Rapidly analyzes an AST to assess whether optimizations are profitable
 * without allocating or copying nodes.
 */
export declare function analyzeAstProfitability(program: N.Program): ProgramComplexityMetrics;
/**
 * Computes profitability decision for the compiler pipeline.
 */
export declare function computeProfitabilityDecision(metrics: ProgramComplexityMetrics, explicitTier?: OptimizationTier): ProfitabilityDecision;
//# sourceMappingURL=profitability.d.ts.map