"use strict";
/**
 * HKD AST Visitor
 *
 * Generic visitor pattern for traversing and transforming the AST.
 * Both the semantic analyser, bytecode compiler, formatter, and linter
 * use this visitor rather than re-implementing traversal logic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseVisitor = void 0;
exports.visitStmt = visitStmt;
exports.visitExpr = visitExpr;
// ─── Dispatch helpers ─────────────────────────────────────────────────────────
function visitStmt(visitor, stmt) {
    switch (stmt.kind) {
        case "VarDeclStmt": return visitor.visitVarDeclStmt(stmt);
        case "ConstDeclStmt": return visitor.visitConstDeclStmt(stmt);
        case "FunctionDeclStmt": return visitor.visitFunctionDeclStmt(stmt);
        case "StructDeclStmt": return visitor.visitStructDeclStmt(stmt);
        case "ImplBlockStmt": return visitor.visitImplBlockStmt(stmt);
        case "TraitDeclStmt": return visitor.visitTraitDeclStmt(stmt);
        case "TypeAliasStmt": return visitor.visitTypeAliasStmt(stmt);
        case "ReturnStmt": return visitor.visitReturnStmt(stmt);
        case "BreakStmt": return visitor.visitBreakStmt(stmt);
        case "ContinueStmt": return visitor.visitContinueStmt(stmt);
        case "IfStmt": return visitor.visitIfStmt(stmt);
        case "WhileStmt": return visitor.visitWhileStmt(stmt);
        case "ForStmt": return visitor.visitForStmt(stmt);
        case "BlockStmt": return visitor.visitBlockStmt(stmt);
        case "ExprStmt": return visitor.visitExprStmt(stmt);
        case "ImportStmt": return visitor.visitImportStmt(stmt);
        case "ExportStmt": return visitor.visitExportStmt(stmt);
        case "TestStmt": return visitor.visitTestStmt(stmt);
        case "AssertStmt": return visitor.visitAssertStmt(stmt);
    }
}
function visitExpr(visitor, expr) {
    switch (expr.kind) {
        case "IntLiteral": return visitor.visitIntLiteral(expr);
        case "FloatLiteral": return visitor.visitFloatLiteral(expr);
        case "StringLiteral": return visitor.visitStringLiteral(expr);
        case "BoolLiteral": return visitor.visitBoolLiteral(expr);
        case "NullLiteral": return visitor.visitNullLiteral(expr);
        case "IdentExpr": return visitor.visitIdentExpr(expr);
        case "BinaryExpr": return visitor.visitBinaryExpr(expr);
        case "UnaryExpr": return visitor.visitUnaryExpr(expr);
        case "CallExpr": return visitor.visitCallExpr(expr);
        case "IndexExpr": return visitor.visitIndexExpr(expr);
        case "MemberExpr": return visitor.visitMemberExpr(expr);
        case "AssignExpr": return visitor.visitAssignExpr(expr);
        case "CompoundAssignExpr": return visitor.visitCompoundAssignExpr(expr);
        case "ArrayExpr": return visitor.visitArrayExpr(expr);
        case "ObjectExpr": return visitor.visitObjectExpr(expr);
        case "FunctionExpr": return visitor.visitFunctionExpr(expr);
        case "IfExpr": return visitor.visitIfExpr(expr);
        case "BlockExpr": return visitor.visitBlockExpr(expr);
        case "StructInitExpr": return visitor.visitStructInitExpr(expr);
        case "RangeExpr": return visitor.visitRangeExpr(expr);
        case "CastExpr": return visitor.visitCastExpr(expr);
        case "MatchExpr": return visitor.visitMatchExpr(expr);
        case "AwaitExpr": return visitor.visitAwaitExpr(expr);
    }
}
// ─── Base visitor (no-op) — subclass and override what you need ───────────────
class BaseVisitor {
    visitProgram(node) {
        let result = this.defaultResult();
        for (const stmt of node.statements) {
            result = this.combineResults(result, visitStmt(this, stmt));
        }
        return result;
    }
    visitVarDeclStmt(node) {
        if (node.initializer)
            return visitExpr(this, node.initializer);
        return this.defaultResult();
    }
    visitConstDeclStmt(node) {
        return visitExpr(this, node.initializer);
    }
    visitFunctionDeclStmt(node) {
        return this.visitBlockStmt(node.body);
    }
    visitStructDeclStmt(_node) {
        return this.defaultResult();
    }
    visitImplBlockStmt(node) {
        let result = this.defaultResult();
        for (const m of node.methods) {
            result = this.combineResults(result, this.visitFunctionDeclStmt(m));
        }
        return result;
    }
    visitTraitDeclStmt(_node) {
        return this.defaultResult();
    }
    visitTypeAliasStmt(_node) {
        return this.defaultResult();
    }
    visitReturnStmt(node) {
        if (node.value)
            return visitExpr(this, node.value);
        return this.defaultResult();
    }
    visitBreakStmt(_node) { return this.defaultResult(); }
    visitContinueStmt(_node) { return this.defaultResult(); }
    visitIfStmt(node) {
        let result = visitExpr(this, node.condition);
        result = this.combineResults(result, this.visitBlockStmt(node.then));
        if (node.else_) {
            result = this.combineResults(result, node.else_.kind === "BlockStmt"
                ? this.visitBlockStmt(node.else_)
                : this.visitIfStmt(node.else_));
        }
        return result;
    }
    visitWhileStmt(node) {
        return this.combineResults(visitExpr(this, node.condition), this.visitBlockStmt(node.body));
    }
    visitForStmt(node) {
        return this.combineResults(visitExpr(this, node.iterable), this.visitBlockStmt(node.body));
    }
    visitBlockStmt(node) {
        let result = this.defaultResult();
        for (const stmt of node.body) {
            result = this.combineResults(result, visitStmt(this, stmt));
        }
        return result;
    }
    visitExprStmt(node) { return visitExpr(this, node.expr); }
    visitImportStmt(_node) { return this.defaultResult(); }
    visitExportStmt(node) { return visitStmt(this, node.declaration); }
    visitTestStmt(node) { return this.visitBlockStmt(node.body); }
    visitAssertStmt(node) {
        let r = visitExpr(this, node.condition);
        if (node.message)
            r = this.combineResults(r, visitExpr(this, node.message));
        return r;
    }
    // Expressions
    visitIntLiteral(_node) { return this.defaultResult(); }
    visitFloatLiteral(_node) { return this.defaultResult(); }
    visitStringLiteral(_node) { return this.defaultResult(); }
    visitBoolLiteral(_node) { return this.defaultResult(); }
    visitNullLiteral(_node) { return this.defaultResult(); }
    visitIdentExpr(_node) { return this.defaultResult(); }
    visitBinaryExpr(node) {
        return this.combineResults(visitExpr(this, node.left), visitExpr(this, node.right));
    }
    visitUnaryExpr(node) { return visitExpr(this, node.operand); }
    visitCallExpr(node) {
        let r = visitExpr(this, node.callee);
        for (const arg of node.args) {
            r = this.combineResults(r, visitExpr(this, arg));
        }
        return r;
    }
    visitIndexExpr(node) {
        return this.combineResults(visitExpr(this, node.object), visitExpr(this, node.index));
    }
    visitMemberExpr(node) { return visitExpr(this, node.object); }
    visitAssignExpr(node) {
        return this.combineResults(visitExpr(this, node.target), visitExpr(this, node.value));
    }
    visitCompoundAssignExpr(node) {
        return this.combineResults(visitExpr(this, node.target), visitExpr(this, node.value));
    }
    visitArrayExpr(node) {
        let r = this.defaultResult();
        for (const el of node.elements) {
            r = this.combineResults(r, visitExpr(this, el));
        }
        return r;
    }
    visitObjectExpr(node) {
        let r = this.defaultResult();
        for (const field of node.fields) {
            r = this.combineResults(r, visitExpr(this, field.value));
        }
        return r;
    }
    visitFunctionExpr(node) {
        return this.visitBlockStmt(node.body);
    }
    visitIfExpr(node) {
        let r = visitExpr(this, node.condition);
        r = this.combineResults(r, this.visitBlockStmt(node.then));
        if (node.else_) {
            r = this.combineResults(r, node.else_.kind === "BlockStmt"
                ? this.visitBlockStmt(node.else_)
                : this.visitIfExpr(node.else_));
        }
        return r;
    }
    visitBlockExpr(node) {
        let r = this.defaultResult();
        for (const stmt of node.body) {
            r = this.combineResults(r, visitStmt(this, stmt));
        }
        return r;
    }
    visitStructInitExpr(node) {
        let r = this.defaultResult();
        for (const field of node.fields) {
            r = this.combineResults(r, visitExpr(this, field.value));
        }
        return r;
    }
    visitRangeExpr(node) {
        return this.combineResults(visitExpr(this, node.start), visitExpr(this, node.end));
    }
    visitCastExpr(node) { return visitExpr(this, node.expr); }
    visitMatchExpr(node) {
        let r = visitExpr(this, node.scrutinee);
        for (const arm of node.arms) {
            if (arm.guard)
                r = this.combineResults(r, visitExpr(this, arm.guard));
            if (arm.body.kind === "BlockStmt") {
                r = this.combineResults(r, this.visitBlockStmt(arm.body));
            }
            else {
                r = this.combineResults(r, visitExpr(this, arm.body));
            }
        }
        return r;
    }
    visitAwaitExpr(node) {
        return visitExpr(this, node.expr);
    }
}
exports.BaseVisitor = BaseVisitor;
//# sourceMappingURL=visitor.js.map