/**
 * HKD High-Level Intermediate Representation (HIR)
 * 
 * Desugars AST constructs into an explicit, scoped, type-annotated representation
 * serving as the entry point to compiler optimizations.
 */

import * as N from "../ast/nodes.js";

export type HIRExpr =
  | { kind: "Literal"; value: number | string | boolean | null }
  | { kind: "Variable"; name: string; slot?: number; isGlobal: boolean }
  | { kind: "Binary"; op: string; left: HIRExpr; right: HIRExpr }
  | { kind: "Unary"; op: string; operand: HIRExpr }
  | { kind: "Call"; callee: HIRExpr; args: HIRExpr[] }
  | { kind: "FieldAccess"; target: HIRExpr; field: string }
  | { kind: "ArrayLiteral"; elements: HIRExpr[] }
  | { kind: "ObjectLiteral"; properties: { key: string; value: HIRExpr }[] };

export type HIRStmt =
  | { kind: "Expr"; expr: HIRExpr }
  | { kind: "Let"; name: string; slot: number; init: HIRExpr }
  | { kind: "Assign"; name: string; slot?: number; isGlobal: boolean; value: HIRExpr }
  | { kind: "SetField"; target: HIRExpr; field: string; value: HIRExpr }
  | { kind: "If"; condition: HIRExpr; thenBranch: HIRStmt[]; elseBranch?: HIRStmt[] }
  | { kind: "While"; condition: HIRExpr; body: HIRStmt[] }
  | { kind: "Return"; value?: HIRExpr }
  | { kind: "Block"; statements: HIRStmt[] }
  | { kind: "FunctionDecl"; name: string; params: string[]; body: HIRStmt[] };

export interface HIRProgram {
  statements: HIRStmt[];
}

export class HIRLowerer {
  private localSlots = new Map<string, number>();
  private nextSlot = 0;

  public lower(program: N.Program): HIRProgram {
    const statements: HIRStmt[] = [];
    for (const stmt of program.statements) {
      const lowered = this.lowerStmt(stmt);
      if (lowered) statements.push(lowered);
    }
    return { statements };
  }

  private lowerStmt(stmt: N.Stmt): HIRStmt | null {
    switch (stmt.kind) {
      case "VarDeclStmt": {
        const slot = this.nextSlot++;
        this.localSlots.set(stmt.name, slot);
        const init = stmt.initializer ? this.lowerExpr(stmt.initializer) : { kind: "Literal" as const, value: null };
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
          statements: stmt.body.map((s: N.Stmt) => this.lowerStmt(s)).filter((s): s is HIRStmt => s !== null),
        };
      case "IfStmt":
        return {
          kind: "If",
          condition: this.lowerExpr(stmt.condition),
          thenBranch: this.lowerBlock(stmt.then),
          elseBranch: stmt.else_ ? (stmt.else_.kind === "BlockStmt" ? this.lowerBlock(stmt.else_) : [this.lowerStmt(stmt.else_)].filter((s): s is HIRStmt => s !== null)) : undefined,
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
          params: stmt.params.map((p: N.Param) => p.name),
          body: this.lowerBlock(stmt.body),
        };
      default:
        return null;
    }
  }

  private lowerBlock(node: N.BlockStmt): HIRStmt[] {
    return node.body.map((s: N.Stmt) => this.lowerStmt(s)).filter((s): s is HIRStmt => s !== null);
  }

  private lowerExpr(expr: N.Expr): HIRExpr {
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
          args: expr.args.map((a: N.Expr) => this.lowerExpr(a)),
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
          elements: expr.elements.map((e: N.Expr) => this.lowerExpr(e)),
        };
      case "ObjectExpr":
        return {
          kind: "ObjectLiteral",
          properties: expr.fields.map((p: N.ObjectField) => ({
            key: p.key,
            value: this.lowerExpr(p.value),
          })),
        };
      default:
        return { kind: "Literal", value: null };
    }
  }
}
