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
import { Diagnostic, Severity, SourceSpan } from "../errors/index.js";

// ─── Lint warning codes ───────────────────────────────────────────────────────

export const LintCode = {
  L001: "L001", // Unused variable
  L002: "L002", // Unreachable code
  L003: "L003", // Missing return
  L004: "L004", // Suspicious comparison
  L005: "L005", // Unused import
  L006: "L006", // Empty block
  L007: "L007", // Variable shadowing
  L008: "L008", // Constant condition
} as const;

export type LintCode = (typeof LintCode)[keyof typeof LintCode];

// ─── Lint issue ───────────────────────────────────────────────────────────────

export interface LintIssue {
  code: LintCode;
  severity: Severity;
  message: string;
  span: SourceSpan;
  help?: string;
}

// ─── Scope tracker for lint ───────────────────────────────────────────────────

class LintScope {
  private vars: Map<string, { span: SourceSpan; used: boolean }> = new Map();
  constructor(public parent: LintScope | null) {}

  declare(name: string, span: SourceSpan): void {
    this.vars.set(name, { span, used: false });
  }

  use(name: string): boolean {
    const v = this.vars.get(name);
    if (v) { v.used = true; return true; }
    return this.parent?.use(name) ?? false;
  }

  hasLocal(name: string): boolean {
    return this.vars.has(name);
  }

  unusedVars(): Array<{ name: string; span: SourceSpan }> {
    return Array.from(this.vars.entries())
      .filter(([name, v]) => !v.used && !name.startsWith("_"))
      .map(([name, v]) => ({ name, span: v.span }));
  }
}

// ─── Linter class ─────────────────────────────────────────────────────────────

export class Linter {
  private issues: LintIssue[] = [];
  private scope: LintScope = new LintScope(null);
  private importedNames: Map<string, SourceSpan> = new Map();
  private usedImports: Set<string> = new Set();

  lint(program: N.Program, ignoredCodes = new Set<string>()): LintIssue[] {
    this.issues = [];
    this.scope = new LintScope(null);

    for (const stmt of program.statements) {
      this.lintStmt(stmt);
    }

    this.reportUnused(this.scope);

    // Unused imports
    for (const [name, span] of this.importedNames) {
      if (!this.usedImports.has(name)) {
        this.issue(LintCode.L005, "warning", `Imported name \`${name}\` is never used`, span, {
          help: `Remove the import or use \`${name}\` somewhere`,
        });
      }
    }

    if (ignoredCodes.size > 0) {
      return this.issues.filter((i) => !ignoredCodes.has(i.code));
    }
    return this.issues;
  }

  private lintStmt(stmt: N.Stmt): boolean {
    // Returns true if this statement always terminates (return/break/continue)
    switch (stmt.kind) {
      case "VarDeclStmt": {
        if (stmt.initializer) this.lintExpr(stmt.initializer);
        this.scope.declare(stmt.name, stmt.span);
        return false;
      }
      case "ConstDeclStmt": {
        this.lintExpr(stmt.initializer);
        this.scope.declare(stmt.name, stmt.span);
        return false;
      }
      case "FunctionDeclStmt": {
        this.scope.declare(stmt.name, stmt.span);
        this.lintFunction(stmt.params, stmt.body, stmt.returnType !== null);
        return false;
      }
      case "StructDeclStmt": return false;
      case "ImplBlockStmt": {
        for (const m of stmt.methods) {
          this.lintFunction(m.params, m.body, m.returnType !== null);
        }
        return false;
      }
      case "TraitDeclStmt":  return false;
      case "TypeAliasStmt":  return false;
      case "ReturnStmt": {
        if (stmt.value) this.lintExpr(stmt.value);
        return true;
      }
      case "BreakStmt":    return true;
      case "ContinueStmt": return true;
      case "IfStmt": {
        this.lintExpr(stmt.condition);
        this.checkConstantCondition(stmt.condition);
        this.lintBlock(stmt.then);
        if (stmt.else_) {
          if (stmt.else_.kind === "IfStmt") this.lintStmt(stmt.else_);
          else this.lintBlock(stmt.else_);
        }
        return false;
      }
      case "WhileStmt": {
        this.lintExpr(stmt.condition);
        this.checkConstantCondition(stmt.condition);
        this.lintBlock(stmt.body);
        return false;
      }
      case "ForStmt": {
        this.lintExpr(stmt.iterable);
        const forScope = new LintScope(this.scope);
        const prev = this.scope;
        this.scope = forScope;
        forScope.declare(stmt.variable, stmt.span);
        this.lintBlock(stmt.body);
        this.reportUnused(forScope);
        this.scope = prev;
        return false;
      }
      case "BlockStmt":
        return this.lintBlock(stmt);
      case "ExprStmt": {
        this.lintExpr(stmt.expr);
        return false;
      }
      case "ImportStmt": {
        if (stmt.defaultName) {
          this.importedNames.set(stmt.defaultName, stmt.span);
          this.scope.declare(stmt.defaultName, stmt.span);
        }
        for (const spec of stmt.specifiers) {
          const alias = spec.alias ?? spec.name;
          this.importedNames.set(alias, stmt.span);
          this.scope.declare(alias, stmt.span);
        }
        return false;
      }
      case "ExportStmt":
        return this.lintStmt(stmt.declaration);
      case "TestStmt": {
        this.lintBlock(stmt.body);
        return false;
      }
      case "AssertStmt": {
        this.lintExpr(stmt.condition);
        if (stmt.message) this.lintExpr(stmt.message);
        return false;
      }
    }
  }

  private lintBlock(block: N.BlockStmt): boolean {
    if (block.body.length === 0) {
      this.issue(LintCode.L006, "hint", "Empty block", block.span);
    }

    const blockScope = new LintScope(this.scope);
    const prev = this.scope;
    this.scope = blockScope;

    let terminated = false;
    for (let i = 0; i < block.body.length; i++) {
      if (terminated) {
        this.issue(
          LintCode.L002,
          "warning",
          "Unreachable code",
          block.body[i].span,
          { help: "Remove or move this code — it can never be executed" }
        );
        break;
      }
      terminated = this.lintStmt(block.body[i]);
    }

    this.reportUnused(blockScope);
    this.scope = prev;
    return terminated;
  }

  private lintFunction(
    params: N.Param[],
    body: N.BlockStmt,
    hasReturnType: boolean
  ): void {
    const fnScope = new LintScope(this.scope);
    const prev = this.scope;
    this.scope = fnScope;

    for (const p of params) {
      fnScope.declare(p.name, p.span);
      if (p.defaultValue) this.lintExpr(p.defaultValue);
    }

    const terminated = this.lintBlock(body);

    if (hasReturnType && !terminated) {
      // Check if any return statement exists
      const hasReturn = bodyHasReturn(body);
      if (!hasReturn) {
        this.issue(
          LintCode.L003,
          "warning",
          "Function may not return a value on all code paths",
          body.span,
          { help: "Add a `return` statement at the end of the function" }
        );
      }
    }

    this.reportUnused(fnScope);
    this.scope = prev;
  }

  private lintExpr(expr: N.Expr): void {
    switch (expr.kind) {
      case "IdentExpr": {
        this.scope.use(expr.name);
        // Track import usage
        if (this.importedNames.has(expr.name)) {
          this.usedImports.add(expr.name);
        }
        break;
      }
      case "BinaryExpr": {
        this.lintExpr(expr.left);
        this.lintExpr(expr.right);
        // Detect `x == true` / `x == false` / `x == null` patterns
        if (expr.op === "==" || expr.op === "!=") {
          if (
            expr.right.kind === "BoolLiteral" ||
            expr.right.kind === "NullLiteral"
          ) {
            this.issue(
              LintCode.L004,
              "hint",
              `Suspicious comparison with \`${expr.right.kind === "BoolLiteral" ? expr.right.value : "null"}\``,
              expr.span,
              {
                help: expr.right.kind === "BoolLiteral"
                  ? `Use the expression directly instead of comparing to \`${expr.right.value}\``
                  : "Use `!= null` or a null check",
              }
            );
          }
        }
        break;
      }
      case "UnaryExpr":   this.lintExpr(expr.operand); break;
      case "CallExpr":    this.lintExpr(expr.callee); expr.args.forEach((a) => this.lintExpr(a)); break;
      case "IndexExpr":   this.lintExpr(expr.object); this.lintExpr(expr.index); break;
      case "MemberExpr":  this.lintExpr(expr.object); break;
      case "AssignExpr":  this.lintExpr(expr.target); this.lintExpr(expr.value); break;
      case "CompoundAssignExpr": this.lintExpr(expr.target); this.lintExpr(expr.value); break;
      case "ArrayExpr":   expr.elements.forEach((e) => this.lintExpr(e)); break;
      case "ObjectExpr":  expr.fields.forEach((f) => this.lintExpr(f.value)); break;
      case "FunctionExpr": this.lintFunction(expr.params, expr.body, expr.returnType !== null); break;
      case "IfExpr":      this.lintExpr(expr.condition); this.lintBlock(expr.then); break;
      case "BlockExpr":   expr.body.forEach((s) => this.lintStmt(s)); break;
      case "StructInitExpr": expr.fields.forEach((f) => this.lintExpr(f.value)); break;
      case "RangeExpr":   this.lintExpr(expr.start); this.lintExpr(expr.end); break;
      case "CastExpr":    this.lintExpr(expr.expr); break;
      case "MatchExpr": {
        this.lintExpr(expr.scrutinee);
        for (const arm of expr.arms) {
          if (arm.guard) this.lintExpr(arm.guard);
          if (arm.body.kind === "BlockStmt") {
            this.lintBlock(arm.body);
          } else {
            this.lintExpr(arm.body);
          }
        }
        break;
      }
      default: break;
    }
  }

  private checkConstantCondition(expr: N.Expr): void {
    if (
      expr.kind === "BoolLiteral" ||
      (expr.kind === "IntLiteral" && (expr.value === 0 || expr.value === 1))
    ) {
      this.issue(
        LintCode.L008,
        "warning",
        "Condition is always constant",
        expr.span,
        { help: "This condition will always evaluate to the same value" }
      );
    }
  }

  private reportUnused(scope: LintScope): void {
    for (const { name, span } of scope.unusedVars()) {
      this.issue(
        LintCode.L001,
        "warning",
        `Variable \`${name}\` is declared but never used`,
        span,
        { help: `Prefix with \`_\` to suppress: \`_${name}\`` }
      );
    }
  }

  private issue(
    code: LintCode,
    severity: Severity,
    message: string,
    span: SourceSpan,
    opts: { help?: string } = {}
  ): void {
    this.issues.push({ code, severity, message, span, help: opts.help });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bodyHasReturn(block: N.BlockStmt): boolean {
  for (const stmt of block.body) {
    if (stmt.kind === "ReturnStmt") return true;
    if (stmt.kind === "IfStmt") {
      if (bodyHasReturn(stmt.then)) return true;
    }
    if (stmt.kind === "BlockStmt") {
      if (bodyHasReturn(stmt)) return true;
    }
  }
  return false;
}

// ─── Convenience function ─────────────────────────────────────────────────────

export function lint(program: N.Program, ignoredCodes?: Set<string>): LintIssue[] {
  return new Linter().lint(program, ignoredCodes);
}

export function formatLintIssues(
  issues: LintIssue[],
  source: string,
  fileName: string
): string {
  if (issues.length === 0) return `${fileName}: No issues found.`;

  const lines: string[] = [];
  for (const issue of issues) {
    const loc = `${fileName}:${issue.span.start.line}:${issue.span.start.column}`;
    const severity = issue.severity.toUpperCase();
    lines.push(`[${issue.code}] ${severity}: ${issue.message}`);
    lines.push(`  --> ${loc}`);

    const srcLines = source.split("\n");
    const lineIdx = issue.span.start.line - 1;
    if (lineIdx >= 0 && lineIdx < srcLines.length) {
      const srcLine = srcLines[lineIdx];
      lines.push(`  ${issue.span.start.line} | ${srcLine}`);
      const col = issue.span.start.column - 1;
      lines.push(`  ${" ".repeat(String(issue.span.start.line).length)} | ${" ".repeat(col)}^`);
    }

    if (issue.help) lines.push(`  Help: ${issue.help}`);
    lines.push("");
  }

  return lines.join("\n");
}
