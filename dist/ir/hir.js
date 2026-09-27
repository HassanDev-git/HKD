"use strict";
/**
 * HKD High-Level Intermediate Representation (HIR)
 *
 * Desugars AST constructs into an explicit, scoped, type-annotated representation
 * serving as the entry point to compiler optimizations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIRLowerer = void 0;
class HIRLowerer {
    localSlots = new Map();
    nextSlot = 0;
    lower(program) {
        const statements = [];
        for (const stmt of program.statements) {
            const lowered = this.lowerStmt(stmt);
            if (lowered)
                statements.push(lowered);
        }
        return { statements };
    }
    lowerStmt(stmt) {
        switch (stmt.kind) {
            case "VarDeclStmt": {
                const slot = this.nextSlot++;
                this.localSlots.set(stmt.name, slot);
                const init = stmt.initializer ? this.lowerExpr(stmt.initializer) : { kind: "Literal", value: null };
                return {
                    kind: "Let",
                    name: stmt.name,
                    slot,
                    init,
                };
            }
            case "ExprStmt":
                return { kind: "Expr", expr: this.lowerExpr(stmt.expr) };
            case "ReturnStmt":
                return { kind: "Return", value: stmt.value ? this.lowerExpr(stmt.value) : undefined };
            case "BlockStmt":
                return {
                    kind: "Block",
                    statements: stmt.body.map((s) => this.lowerStmt(s)).filter((s) => s !== null),
                };
            case "IfStmt":
                return {
                    kind: "If",
                    condition: this.lowerExpr(stmt.condition),
                    thenBranch: this.lowerBlock(stmt.then),
                    elseBranch: stmt.else_ ? (stmt.else_.kind === "BlockStmt" ? this.lowerBlock(stmt.else_) : [this.lowerStmt(stmt.else_)].filter((s) => s !== null)) : undefined,
                };
            case "WhileStmt":
                return {
                    kind: "While",
                    condition: this.lowerExpr(stmt.condition),
                    body: this.lowerBlock(stmt.body),
                };
            case "FunctionDeclStmt":
                return {
                    kind: "FunctionDecl",
                    name: stmt.name,
                    params: stmt.params.map((p) => p.name),
                    body: this.lowerBlock(stmt.body),
                };
            default:
                return null;
        }
    }
    lowerBlock(node) {
        return node.body.map((s) => this.lowerStmt(s)).filter((s) => s !== null);
    }
    lowerExpr(expr) {
        switch (expr.kind) {
            case "IntLiteral":
            case "FloatLiteral":
                return { kind: "Literal", value: expr.value };
            case "StringLiteral":
                return { kind: "Literal", value: expr.value };
            case "BoolLiteral":
                return { kind: "Literal", value: expr.value };
            case "NullLiteral":
                return { kind: "Literal", value: null };
            case "IdentExpr": {
                const slot = this.localSlots.get(expr.name);
                return { kind: "Variable", name: expr.name, slot, isGlobal: slot === undefined };
            }
            case "BinaryExpr":
                return {
                    kind: "Binary",
                    op: expr.op,
                    left: this.lowerExpr(expr.left),
                    right: this.lowerExpr(expr.right),
                };
            case "UnaryExpr":
                return {
                    kind: "Unary",
                    op: expr.op,
                    operand: this.lowerExpr(expr.operand),
                };
            case "CallExpr":
                return {
                    kind: "Call",
                    callee: this.lowerExpr(expr.callee),
                    args: expr.args.map((a) => this.lowerExpr(a)),
                };
            case "MemberExpr":
                return {
                    kind: "FieldAccess",
                    target: this.lowerExpr(expr.object),
                    field: expr.property,
                };
            case "ArrayExpr":
                return {
                    kind: "ArrayLiteral",
                    elements: expr.elements.map((e) => this.lowerExpr(e)),
                };
            case "ObjectExpr":
                return {
                    kind: "ObjectLiteral",
                    properties: expr.fields.map((p) => ({
                        key: p.key,
                        value: this.lowerExpr(p.value),
                    })),
                };
            default:
                return { kind: "Literal", value: null };
        }
    }
}
exports.HIRLowerer = HIRLowerer;
//# sourceMappingURL=hir.js.map