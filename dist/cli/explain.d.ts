/**
 * HKD Explain Tool
 *
 * Provides detailed compiler explanations and corrective guidance for HKD error codes.
 * Invoked via: hkd explain <error_code>
 */
export interface ErrorExplanation {
    code: string;
    title: string;
    category: "Lexer" | "Parser" | "Semantic" | "Runtime" | "VM" | "Package";
    summary: string;
    erroneousExample: string;
    fixedExample: string;
    notes?: string[];
}
export declare const ERROR_EXPLANATIONS: Record<string, ErrorExplanation>;
export declare function explainError(codeOrInput: string): string;
//# sourceMappingURL=explain.d.ts.map