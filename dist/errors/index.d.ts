/**
 * HKD Error System
 *
 * Provides structured, user-friendly error reporting with:
 * - Error codes (E001–E999)
 * - Source locations (file, line, column)
 * - Code snippets with caret highlighting
 * - Helpful suggestions
 * - Warning support
 */
export interface SourceLocation {
    file: string;
    line: number;
    column: number;
    offset: number;
}
export interface SourceSpan {
    start: SourceLocation;
    end: SourceLocation;
}
export declare function spanFrom(start: SourceLocation, end: SourceLocation): SourceSpan;
export declare function unknownLocation(file?: string): SourceLocation;
export declare enum ErrorCode {
    E101 = "E101",// Invalid character
    E102 = "E102",// Unterminated string
    E103 = "E103",// Unterminated block comment
    E104 = "E104",// Invalid number literal
    E105 = "E105",// Invalid escape sequence
    E201 = "E201",// Unexpected token
    E202 = "E202",// Expected token not found
    E203 = "E203",// Unexpected end of file
    E204 = "E204",// Invalid expression
    E205 = "E205",// Invalid assignment target
    E206 = "E206",// Missing closing delimiter
    E301 = "E301",// Undefined variable
    E302 = "E302",// Undefined function
    E303 = "E303",// Type mismatch
    E304 = "E304",// Redeclaration
    E305 = "E305",// Return outside function
    E306 = "E306",// Break/continue outside loop
    E307 = "E307",// Wrong argument count
    E308 = "E308",// Undefined type
    E309 = "E309",// Undefined struct field
    E310 = "E310",// Duplicate struct field
    E401 = "E401",// Division by zero
    E402 = "E402",// Index out of bounds
    E403 = "E403",// Null reference
    E404 = "E404",// Stack overflow
    E405 = "E405",// Invalid operation
    E406 = "E406",// Import not found
    E407 = "E407",// Circular import
    E408 = "E408",// Not callable
    E501 = "E501",// Invalid bytecode
    E502 = "E502",// VM stack underflow
    E503 = "E503",// Unknown opcode
    E601 = "E601",// Package not found
    E602 = "E602",// Version conflict
    E603 = "E603",// Invalid manifest
    E604 = "E604"
}
export type Severity = "error" | "warning" | "info" | "hint";
export interface Diagnostic {
    severity: Severity;
    code: ErrorCode;
    message: string;
    span?: SourceSpan;
    label?: string;
    help?: string[];
    notes?: string[];
}
export declare class HkdError extends Error {
    readonly diagnostic: Diagnostic;
    constructor(diagnostic: Diagnostic);
}
export declare class ErrorReporter {
    private diagnostics;
    private source;
    private fileName;
    constructor(source: string, fileName: string);
    report(diagnostic: Diagnostic): void;
    error(code: ErrorCode, message: string, span?: SourceSpan, opts?: {
        label?: string;
        help?: string[];
        notes?: string[];
    }): void;
    warning(code: ErrorCode, message: string, span?: SourceSpan, opts?: {
        label?: string;
        help?: string[];
        notes?: string[];
    }): void;
    hasErrors(): boolean;
    getAll(): Diagnostic[];
    getErrors(): Diagnostic[];
    getWarnings(): Diagnostic[];
    clear(): void;
    /**
     * Format all diagnostics as a human-readable string.
     */
    format(): string;
}
/**
 * Format a single diagnostic into a rich terminal string.
 *
 * Example output:
 *
 *   HKD Error[E301]
 *
 *   Undefined variable `username`
 *
 *     --> main.hkd:12:11
 *
 *   12 | print(username)
 *                ^^^^^^^^
 *
 *   Help:
 *     Did you mean `userName`?
 */
export declare function formatDiagnostic(diag: Diagnostic, source: string, fileName: string): string;
/** Throw an HkdError immediately (for unrecoverable parse/runtime errors). */
export declare function throwError(code: ErrorCode, message: string, span?: SourceSpan, opts?: {
    label?: string;
    help?: string[];
    notes?: string[];
}): never;
//# sourceMappingURL=index.d.ts.map