"use strict";
/**
 * HKD Optimization Profitability & Cost Model (Phase 9E)
 *
 * Provides compile-time cost/benefit heuristics, optimization tiers,
 * budget tracking, and small-program fast-path detection.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OptimizationTier = void 0;
exports.analyzeAstProfitability = analyzeAstProfitability;
exports.computeProfitabilityDecision = computeProfitabilityDecision;
var OptimizationTier;
(function (OptimizationTier) {
    OptimizationTier[OptimizationTier["Tier0_AlwaysCheap"] = 0] = "Tier0_AlwaysCheap";
    OptimizationTier[OptimizationTier["Tier1_Structural"] = 1] = "Tier1_Structural";
    OptimizationTier[OptimizationTier["Tier2_Expensive"] = 2] = "Tier2_Expensive";
})(OptimizationTier || (exports.OptimizationTier = OptimizationTier = {}));
/**
 * Rapidly analyzes an AST to assess whether optimizations are profitable
 * without allocating or copying nodes.
 */
function analyzeAstProfitability(program) {
    let statementCount = 0;
    let expressionCount = 0;
    let functionCount = 0;
    let loopCount = 0;
    let branchCount = 0;
    let hasMutations = false;
    let hasAsync = false;
    let hasFoldableCandidates = false;
    function scan(node) {
        if (!node || typeof node !== "object")
            return;
        if (node.kind) {
            if (node.kind.endsWith("Stmt")) {
                statementCount++;
                if (node.kind === "FunctionDeclStmt") {
                    functionCount++;
                    if (node.isAsync)
                        hasAsync = true;
                }
                else if (node.kind === "WhileStmt" || node.kind === "ForStmt") {
                    loopCount++;
                }
                else if (node.kind === "IfStmt") {
                    branchCount++;
                }
            }
            else if (node.kind.endsWith("Expr")) {
                expressionCount++;
                if (node.kind === "AssignExpr" || node.kind === "CompoundAssignExpr") {
                    hasMutations = true;
                }
                else if (node.kind === "BinaryExpr") {
                    // Check for literal operands that could fold
                    const l = node.left?.kind;
                    const r = node.right?.kind;
                    if (l === "IntLiteral" || l === "FloatLiteral" || l === "StringLiteral" || l === "BoolLiteral" ||
                        r === "IntLiteral" || r === "FloatLiteral" || r === "StringLiteral" || r === "BoolLiteral") {
                        hasFoldableCandidates = true;
                    }
                }
                else if (node.kind === "IfExpr") {
                    branchCount++;
                }
            }
        }
        for (const key of Object.keys(node)) {
            if (key !== "span")
                scan(node[key]);
        }
    }
    scan(program);
    // Complexity heuristic: statements + expressions + loop weight (hotness estimate)
    const estimatedComplexity = statementCount +
        expressionCount +
        loopCount * 10 +
        branchCount * 3 +
        functionCount * 5;
    // Optimization budget proportional to complexity
    const budget = Math.max(10, Math.floor(estimatedComplexity * 1.5));
    return {
        statementCount,
        expressionCount,
        functionCount,
        loopCount,
        branchCount,
        hasMutations,
        hasAsync,
        hasFoldableCandidates,
        estimatedComplexity,
        budget,
    };
}
/**
 * Computes profitability decision for the compiler pipeline.
 */
function computeProfitabilityDecision(metrics, explicitTier) {
    if (explicitTier !== undefined) {
        return {
            isSmallProgram: false,
            allowedTier: explicitTier,
            enableAstPass: explicitTier >= OptimizationTier.Tier1_Structural,
            enableDce: explicitTier >= OptimizationTier.Tier1_Structural,
            enableRegisterOpt: true,
            budget: metrics.budget,
            metrics,
        };
    }
    // Small Program Fast Path:
    // If program is tiny (few statements, no loops, no foldable candidates),
    // AST optimization pass overhead will exceed any potential runtime benefit.
    const isSmallProgram = metrics.statementCount <= 5 &&
        metrics.loopCount === 0 &&
        metrics.functionCount === 0 &&
        !metrics.hasFoldableCandidates;
    if (isSmallProgram) {
        return {
            isSmallProgram: true,
            allowedTier: OptimizationTier.Tier0_AlwaysCheap,
            enableAstPass: false,
            enableDce: false,
            enableRegisterOpt: true, // Register cleanup is sub-millisecond
            budget: metrics.budget,
            metrics,
        };
    }
    // Medium / Large Programs:
    // If foldable candidates or loops exist, full optimization is profitable
    const allowedTier = metrics.loopCount > 0 || metrics.statementCount > 20 || metrics.hasFoldableCandidates
        ? OptimizationTier.Tier2_Expensive
        : OptimizationTier.Tier1_Structural;
    return {
        isSmallProgram: false,
        allowedTier,
        enableAstPass: metrics.hasFoldableCandidates || metrics.loopCount > 0 || metrics.branchCount > 0,
        enableDce: metrics.branchCount > 0 || metrics.loopCount > 0,
        enableRegisterOpt: true,
        budget: metrics.budget,
        metrics,
    };
}
//# sourceMappingURL=profitability.js.map