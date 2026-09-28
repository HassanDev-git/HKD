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
        switch (node.kind) {
            // ── Statements ──────────────────────────────────────────────────────────
            case "Program": {
                const stmts = node.statements;
                if (stmts) {
                    for (let i = 0; i < stmts.length; i++)
                        scan(stmts[i]);
                }
                return;
            }
            case "BlockStmt": {
                statementCount++;
                const body = node.body;
                if (body) {
                    for (let i = 0; i < body.length; i++)
                        scan(body[i]);
                }
                return;
            }
            case "FunctionDeclStmt": {
                statementCount++;
                functionCount++;
                if (node.isAsync)
                    hasAsync = true;
                scan(node.body);
                return;
            }
            case "WhileStmt": {
                statementCount++;
                loopCount++;
                scan(node.condition);
                scan(node.body);
                return;
            }
            case "ForStmt": {
                statementCount++;
                loopCount++;
                scan(node.iterable);
                scan(node.body);
                return;
            }
            case "IfStmt": {
                statementCount++;
                branchCount++;
                scan(node.condition);
                scan(node.then);
                if (node.else_)
                    scan(node.else_);
                return;
            }
            case "VarDeclStmt":
            case "ConstDeclStmt": {
                statementCount++;
                if (node.initializer)
                    scan(node.initializer);
                return;
            }
            case "ReturnStmt": {
                statementCount++;
                if (node.value)
                    scan(node.value);
                return;
            }
            case "ExprStmt": {
                statementCount++;
                scan(node.expr);
                return;
            }
            case "ImplBlockStmt": {
                statementCount++;
                const methods = node.methods;
                if (methods) {
                    for (let i = 0; i < methods.length; i++)
                        scan(methods[i]);
                }
                return;
            }
            case "ExportStmt": {
                statementCount++;
                scan(node.declaration);
                return;
            }
            case "TestStmt": {
                statementCount++;
                scan(node.body);
                return;
            }
            case "AssertStmt": {
                statementCount++;
                scan(node.condition);
                if (node.message)
                    scan(node.message);
                return;
            }
            case "StructDeclStmt":
            case "TraitDeclStmt":
            case "TypeAliasStmt":
            case "ImportStmt":
            case "BreakStmt":
            case "ContinueStmt": {
                statementCount++;
                return;
            }
            // ── Expressions ─────────────────────────────────────────────────────────
            case "AssignExpr":
            case "CompoundAssignExpr": {
                expressionCount++;
                hasMutations = true;
                scan(node.target);
                scan(node.value);
                return;
            }
            case "BinaryExpr": {
                expressionCount++;
                const l = node.left?.kind;
                const r = node.right?.kind;
                if (l === "IntLiteral" || l === "FloatLiteral" || l === "StringLiteral" || l === "BoolLiteral" ||
                    r === "IntLiteral" || r === "FloatLiteral" || r === "StringLiteral" || r === "BoolLiteral") {
                    hasFoldableCandidates = true;
                }
                scan(node.left);
                scan(node.right);
                return;
            }
            case "UnaryExpr": {
                expressionCount++;
                scan(node.operand);
                return;
            }
            case "IfExpr": {
                expressionCount++;
                branchCount++;
                scan(node.condition);
                scan(node.then);
                if (node.else_)
                    scan(node.else_);
                return;
            }
            case "BlockExpr": {
                expressionCount++;
                const body = node.body;
                if (body) {
                    for (let i = 0; i < body.length; i++)
                        scan(body[i]);
                }
                return;
            }
            case "CallExpr": {
                expressionCount++;
                scan(node.callee);
                const args = node.args;
                if (args) {
                    for (let i = 0; i < args.length; i++)
                        scan(args[i]);
                }
                return;
            }
            case "MemberExpr": {
                expressionCount++;
                scan(node.object);
                return;
            }
            case "IndexExpr": {
                expressionCount++;
                scan(node.object);
                scan(node.index);
                return;
            }
            case "ArrayLiteralExpr":
            case "ArrayExpr": {
                expressionCount++;
                const elements = node.elements;
                if (elements) {
                    for (let i = 0; i < elements.length; i++)
                        scan(elements[i]);
                }
                return;
            }
            case "ObjectLiteralExpr":
            case "ObjectExpr":
            case "StructInitExpr": {
                expressionCount++;
                const fields = node.fields;
                if (fields) {
                    for (let i = 0; i < fields.length; i++) {
                        if (fields[i].value)
                            scan(fields[i].value);
                    }
                }
                return;
            }
            case "MatchExpr": {
                expressionCount++;
                scan(node.scrutinee);
                const arms = node.arms;
                if (arms) {
                    for (let i = 0; i < arms.length; i++) {
                        if (arms[i].guard)
                            scan(arms[i].guard);
                        scan(arms[i].body);
                    }
                }
                return;
            }
            case "RangeExpr": {
                expressionCount++;
                scan(node.start);
                scan(node.end);
                return;
            }
            case "CastExpr": {
                expressionCount++;
                scan(node.expr);
                return;
            }
            case "AwaitExpr": {
                expressionCount++;
                hasAsync = true;
                scan(node.expr);
                return;
            }
            case "FunctionExpr": {
                expressionCount++;
                if (node.isAsync)
                    hasAsync = true;
                scan(node.body);
                return;
            }
            case "IntLiteral":
            case "FloatLiteral":
            case "StringLiteral":
            case "BoolLiteral":
            case "NullLiteral":
            case "IdentExpr": {
                expressionCount++;
                return;
            }
            default: {
                // Fallback for any unknown nodes: walk properties safely
                for (const key of Object.keys(node)) {
                    if (key !== "span")
                        scan(node[key]);
                }
                return;
            }
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