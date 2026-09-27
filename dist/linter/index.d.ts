/**
 * HKD Linter (hkd lint)
 *
 * Detects common issues:
 *   - Unused variables (L001)
 *   - Unreachable code after return/break/continue (L002)
 *   - Missing return in non-void function (L003)
 *   - Suspicious equality comparison (L004)
 *   - Unused imports (L005)
 *   - Empty blocks (L006)
 *   - Variable shadowing (L007)
 */
import * as N from "../ast/nodes.js";
import { Severity, SourceSpan } from "../errors/index.js";
export declare const LintCode: {
    readonly L001: "L001";
    readonly L002: "L002";
    readonly L003: "L003";
    readonly L004: "L004";
    readonly L005: "L005";
    readonly L006: "L006";
    readonly L007: "L007";
    readonly L008: "L008";
};
export type LintCode = (typeof LintCode)[keyof typeof LintCode];
export interface LintIssue {
    code: LintCode;
    severity: Severity;
    message: string;
    span: SourceSpan;
    help?: string;
}
export declare class Linter {
    private issues;
    private scope;
    private importedNames;
    private usedImports;
    lint(program: N.Program, ignoredCodes?: Set<string>): LintIssue[];
    private lintStmt;
    private lintBlock;
    private lintFunction;
    private lintExpr;
    private checkConstantCondition;
    private reportUnused;
    private issue;
}
export declare function lint(program: N.Program, ignoredCodes?: Set<string>): LintIssue[];
export declare function formatLintIssues(issues: LintIssue[], source: string, fileName: string): string;
//# sourceMappingURL=index.d.ts.map