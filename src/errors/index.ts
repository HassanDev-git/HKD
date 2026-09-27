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

// ─── Source Location ────────────────────────────────────────────────────────

export interface SourceLocation {
  file: string;
  line: number;    // 1-based
  column: number;  // 1-based
  offset: number;  // 0-based byte offset in source
}

export interface SourceSpan {
  start: SourceLocation;
  end: SourceLocation;
}

export function spanFrom(start: SourceLocation, end: SourceLocation): SourceSpan {
  return { start, end };
}

export function unknownLocation(file = "<unknown>"): SourceLocation {
  return { file, line: 0, column: 0, offset: 0 };
}

// ─── Error Codes ────────────────────────────────────────────────────────────

export enum ErrorCode {
  // Lexer errors: E1xx
  E101 = "E101", // Invalid character
  E102 = "E102", // Unterminated string
  E103 = "E103", // Unterminated block comment
  E104 = "E104", // Invalid number literal
  E105 = "E105", // Invalid escape sequence

  // Parser errors: E2xx
  E201 = "E201", // Unexpected token
  E202 = "E202", // Expected token not found
  E203 = "E203", // Unexpected end of file
  E204 = "E204", // Invalid expression
  E205 = "E205", // Invalid assignment target
  E206 = "E206", // Missing closing delimiter

  // Semantic errors: E3xx
  E301 = "E301", // Undefined variable
  E302 = "E302", // Undefined function
  E303 = "E303", // Type mismatch
  E304 = "E304", // Redeclaration
  E305 = "E305", // Return outside function
  E306 = "E306", // Break/continue outside loop
  E307 = "E307", // Wrong argument count
  E308 = "E308", // Undefined type
  E309 = "E309", // Undefined struct field
  E310 = "E310", // Duplicate struct field

  // Runtime errors: E4xx
  E401 = "E401", // Division by zero
  E402 = "E402", // Index out of bounds
  E403 = "E403", // Null reference
  E404 = "E404", // Stack overflow
  E405 = "E405", // Invalid operation
  E406 = "E406", // Import not found
  E407 = "E407", // Circular import
  E408 = "E408", // Not callable

  // VM errors: E5xx
  E501 = "E501", // Invalid bytecode
  E502 = "E502", // VM stack underflow
  E503 = "E503", // Unknown opcode

  // Package manager errors: E6xx
  E601 = "E601", // Package not found
  E602 = "E602", // Version conflict
  E603 = "E603", // Invalid manifest
  E604 = "E604", // Dependency cycle
}

// ─── Diagnostic Severity ─────────────────────────────────────────────────────

export type Severity = "error" | "warning" | "info" | "hint";

// ─── Diagnostic (single error/warning) ───────────────────────────────────────

export interface Diagnostic {
  severity: Severity;
  code: ErrorCode;
  message: string;
  span?: SourceSpan;
  label?: string;       // annotation shown at the span
  help?: string[];      // bullet-point suggestions
  notes?: string[];     // additional context lines
}

// ─── HkdError class ──────────────────────────────────────────────────────────

export class HkdError extends Error {
  public readonly diagnostic: Diagnostic;

  constructor(diagnostic: Diagnostic) {
    super(diagnostic.message);
    this.name = "HkdError";
    this.diagnostic = diagnostic;
  }
}

// ─── Error Reporter ──────────────────────────────────────────────────────────

export class ErrorReporter {
  private diagnostics: Diagnostic[] = [];
  private source: string;
  private fileName: string;

  constructor(source: string, fileName: string) {
    this.source = source;
    this.fileName = fileName;
  }

  report(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  error(
    code: ErrorCode,
    message: string,
    span?: SourceSpan,
    opts: { label?: string; help?: string[]; notes?: string[] } = {}
  ): void {
    this.report({
      severity: "error",
      code,
      message,
      span,
      ...opts,
    });
  }

  warning(
    code: ErrorCode,
    message: string,
    span?: SourceSpan,
    opts: { label?: string; help?: string[]; notes?: string[] } = {}
  ): void {
    this.report({
      severity: "warning",
      code,
      message,
      span,
      ...opts,
    });
  }

  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === "error");
  }

  getAll(): Diagnostic[] {
    return [...this.diagnostics];
  }

  getErrors(): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === "error");
  }

  getWarnings(): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === "warning");
  }

  clear(): void {
    this.diagnostics = [];
  }

  /**
   * Format all diagnostics as a human-readable string.
   */
  format(): string {
    return this.diagnostics
      .map((d) => formatDiagnostic(d, this.source, this.fileName))
      .join("\n\n");
  }
}

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
export function formatDiagnostic(
  diag: Diagnostic,
  source: string,
  fileName: string
): string {
  const lines: string[] = [];
  const severityLabel =
    diag.severity === "error"
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
      const endCol =
        diag.span.end.line === diag.span.start.line
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
export function throwError(
  code: ErrorCode,
  message: string,
  span?: SourceSpan,
  opts: { label?: string; help?: string[]; notes?: string[] } = {}
): never {
  throw new HkdError({
    severity: "error",
    code,
    message,
    span,
    ...opts,
  });
}
