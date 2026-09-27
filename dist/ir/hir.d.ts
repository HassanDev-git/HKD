/**
 * HKD High-Level Intermediate Representation (HIR)
 *
 * Desugars AST constructs into an explicit, scoped, type-annotated representation
 * serving as the entry point to compiler optimizations.
 */
import * as N from "../ast/nodes.js";
export type HIRExpr = {
    kind: "Literal";
    value: number | string | boolean | null;
} | {
    kind: "Variable";
    name: string;
    slot?: number;
    isGlobal: boolean;
} | {
    kind: "Binary";
    op: string;
    left: HIRExpr;
    right: HIRExpr;
} | {
    kind: "Unary";
    op: string;
    operand: HIRExpr;
} | {
    kind: "Call";
    callee: HIRExpr;
    args: HIRExpr[];
} | {
    kind: "FieldAccess";
    target: HIRExpr;
    field: string;
} | {
    kind: "ArrayLiteral";
    elements: HIRExpr[];
} | {
    kind: "ObjectLiteral";
    properties: {
        key: string;
        value: HIRExpr;
    }[];
};
export type HIRStmt = {
    kind: "Expr";
    expr: HIRExpr;
} | {
    kind: "Let";
    name: string;
    slot: number;
    init: HIRExpr;
} | {
    kind: "Assign";
    name: string;
    slot?: number;
    isGlobal: boolean;
    value: HIRExpr;
} | {
    kind: "SetField";
    target: HIRExpr;
    field: string;
    value: HIRExpr;
} | {
    kind: "If";
    condition: HIRExpr;
    thenBranch: HIRStmt[];
    elseBranch?: HIRStmt[];
} | {
    kind: "While";
    condition: HIRExpr;
    body: HIRStmt[];
} | {
    kind: "Return";
    value?: HIRExpr;
} | {
    kind: "Block";
    statements: HIRStmt[];
} | {
    kind: "FunctionDecl";
    name: string;
    params: string[];
    body: HIRStmt[];
};
export interface HIRProgram {
    statements: HIRStmt[];
}
export declare class HIRLowerer {
    private localSlots;
    private nextSlot;
    lower(program: N.Program): HIRProgram;
    private lowerStmt;
    private lowerBlock;
    private lowerExpr;
}
//# sourceMappingURL=hir.d.ts.map