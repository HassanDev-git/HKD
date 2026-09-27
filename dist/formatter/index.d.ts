/**
 * HKD Formatter (hkd fmt)
 *
 * Pretty-prints an HKD AST back to canonical source code.
 * Output is deterministic — same AST always produces same output.
 *
 * Rules:
 *   - 4-space indentation
 *   - Space around binary operators
 *   - Space after commas
 *   - Opening braces on same line
 *   - Blank line between top-level declarations
 */
import * as N from "../ast/nodes.js";
export declare class Formatter {
    private indent;
    private INDENT_SIZE;
    format(program: N.Program): string;
    private formatStmt;
    private fmtVarDecl;
    private fmtConstDecl;
    private fmtFunctionDecl;
    private fmtParam;
    private fmtStructDecl;
    private fmtImpl;
    private fmtTraitDecl;
    private fmtTypeAlias;
    private fmtReturn;
    private fmtIf;
    private fmtWhile;
    private fmtFor;
    private fmtBlock;
    private fmtImport;
    private fmtTest;
    private fmtAssert;
    private fmtExpr;
    private fmtPattern;
    /** Wrap sub-expression in parens if its precedence is lower than parent. */
    private fmtExprPrec;
    private fmtType;
    private ind;
    private indStr;
}
export declare function formatSource(source: string, fileName?: string, edition?: "2026" | "2027"): string;
export declare function format(input: N.Program | string): string;
//# sourceMappingURL=index.d.ts.map