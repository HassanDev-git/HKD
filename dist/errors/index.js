"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorReporter = exports.HkdError = exports.ErrorCode = void 0;
exports.spanFrom = spanFrom;
exports.unknownLocation = unknownLocation;
exports.formatDiagnostic = formatDiagnostic;
exports.throwError = throwError;
function spanFrom(start, end) {
    return { start, end };
}
function unknownLocation(file = "<unknown>") {
    return { file, line: 0, column: 0, offset: 0 };
}
// ─── Error Codes ────────────────────────────────────────────────────────────
var ErrorCode;
(function (ErrorCode) {
    // Lexer errors: E1xx
    ErrorCode["E101"] = "E101";
    ErrorCode["E102"] = "E102";
    ErrorCode["E103"] = "E103";
    ErrorCode["E104"] = "E104";
    ErrorCode["E105"] = "E105";
    // Parser errors: E2xx
    ErrorCode["E201"] = "E201";
    ErrorCode["E202"] = "E202";
    ErrorCode["E203"] = "E203";
    ErrorCode["E204"] = "E204";
    ErrorCode["E205"] = "E205";
    ErrorCode["E206"] = "E206";
    // Semantic errors: E3xx
    ErrorCode["E301"] = "E301";
    ErrorCode["E302"] = "E302";
    ErrorCode["E303"] = "E303";
    ErrorCode["E304"] = "E304";
    ErrorCode["E305"] = "E305";
    ErrorCode["E306"] = "E306";
    ErrorCode["E307"] = "E307";
    ErrorCode["E308"] = "E308";
    ErrorCode["E309"] = "E309";
    ErrorCode["E310"] = "E310";
    // Runtime errors: E4xx
    ErrorCode["E401"] = "E401";
    ErrorCode["E402"] = "E402";
    ErrorCode["E403"] = "E403";
    ErrorCode["E404"] = "E404";
    ErrorCode["E405"] = "E405";
    ErrorCode["E406"] = "E406";
    ErrorCode["E407"] = "E407";
    ErrorCode["E408"] = "E408";
    // VM errors: E5xx
    ErrorCode["E501"] = "E501";
    ErrorCode["E502"] = "E502";
    ErrorCode["E503"] = "E503";
    // Package manager errors: E6xx
    ErrorCode["E601"] = "E601";
    ErrorCode["E602"] = "E602";
    ErrorCode["E603"] = "E603";
    ErrorCode["E604"] = "E604";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
// ─── HkdError class ──────────────────────────────────────────────────────────
class HkdError extends Error {
    diagnostic;
    constructor(diagnostic) {
        super(diagnostic.message);
        this.name = "HkdError";
        this.diagnostic = diagnostic;
    }
}
exports.HkdError = HkdError;
// ─── Error Reporter ──────────────────────────────────────────────────────────
class ErrorReporter {
    diagnostics = [];
    source;
    fileName;
    constructor(source, fileName) {
        this.source = source;
        this.fileName = fileName;
    }
    report(diagnostic) {
        this.diagnostics.push(diagnostic);
    }
    error(code, message, span, opts = {}) {
        this.report({
            severity: "error",
            code,
            message,
            span,
            ...opts,
        });
    }
    warning(code, message, span, opts = {}) {
        this.report({
            severity: "warning",
            code,
            message,
            span,
            ...opts,
        });
    }
    hasErrors() {
        return this.diagnostics.some((d) => d.severity === "error");
    }
    getAll() {
        return [...this.diagnostics];
    }
    getErrors() {
        return this.diagnostics.filter((d) => d.severity === "error");
    }
    getWarnings() {
        return this.diagnostics.filter((d) => d.severity === "warning");
    }
    clear() {
        this.diagnostics = [];
    }
    /**
     * Format all diagnostics as a human-readable string.
     */
    format() {
        return this.diagnostics
            .map((d) => formatDiagnostic(d, this.source, this.fileName))
            .join("\n\n");
    }
}
exports.ErrorReporter = ErrorReporter;
// ─── Diagnostic Formatter ────────────────────────────────────────────────────
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
function formatDiagnostic(diag, source, fileName) {
    const lines = [];
    const severityLabel = diag.severity === "error"
        ? "Error"
        : diag.severity === "warning"
            ? "Warning"
            : diag.severity === "info"
                ? "Info"
                : "Hint";
    // Header
    lines.push(`HKD ${severityLabel}[${diag.code}]`);
    lines.push("");
    lines.push(`  ${diag.message}`);
    lines.push("");
    // Source snippet
    if (diag.span) {
        const loc = diag.span.start;
        lines.push(`    --> ${fileName}:${loc.line}:${loc.column}`);
        lines.push("");
        const sourceLines = source.split("\n");
        const lineIdx = loc.line - 1;
        if (lineIdx >= 0 && lineIdx < sourceLines.length) {
            const srcLine = sourceLines[lineIdx];
            const lineNum = String(loc.line);
            const padding = " ".repeat(lineNum.length);
            lines.push(`  ${padding} |`);
            lines.push(`  ${lineNum} | ${srcLine}`);
            // Caret highlighting
            const startCol = diag.span.start.column - 1;
            const endCol = diag.span.end.line === diag.span.start.line
                ? diag.span.end.column - 1
                : srcLine.length;
            const caretLen = Math.max(1, endCol - startCol);
            const caretPad = " ".repeat(startCol);
            const carets = "^".repeat(caretLen);
            const labelStr = diag.label ? ` ${diag.label}` : "";
            lines.push(`  ${padding} | ${caretPad}${carets}${labelStr}`);
            lines.push(`  ${padding} |`);
        }
    }
    // Notes
    if (diag.notes && diag.notes.length > 0) {
        lines.push("");
        for (const note of diag.notes) {
            lines.push(`  Note: ${note}`);
        }
    }
    // Help / suggestions
    if (diag.help && diag.help.length > 0) {
        lines.push("");
        lines.push("  Help:");
        for (const h of diag.help) {
            lines.push(`    ${h}`);
        }
    }
    return lines.join("\n");
}
// ─── Throw helper ────────────────────────────────────────────────────────────
/** Throw an HkdError immediately (for unrecoverable parse/runtime errors). */
function throwError(code, message, span, opts = {}) {
    throw new HkdError({
        severity: "error",
        code,
        message,
        span,
        ...opts,
    });
}
//# sourceMappingURL=index.js.map