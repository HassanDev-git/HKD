/**
 * HKD AST Visitor
 *
 * Generic visitor pattern for traversing and transforming the AST.
 * Both the semantic analyser, bytecode compiler, formatter, and linter
 * use this visitor rather than re-implementing traversal logic.
 */

import * as N from "./nodes.js";

// ─── Visitor interface ────────────────────────────────────────────────────────

/**
 * Implement this interface to visit every node type.
 * Return a value of type R from each visitor method.
 */
export interface Visitor<R = void> {
  // Program
  visitProgram(node: N.Program): R;

  // Statements
  visitVarDeclStmt(node: N.VarDeclStmt): R;
  visitConstDeclStmt(node: N.ConstDeclStmt): R;
  visitFunctionDeclStmt(node: N.FunctionDeclStmt): R;
  visitStructDeclStmt(node: N.StructDeclStmt): R;
  visitImplBlockStmt(node: N.ImplBlockStmt): R;
  visitTraitDeclStmt(node: N.TraitDeclStmt): R;
  visitTypeAliasStmt(node: N.TypeAliasStmt): R;
  visitReturnStmt(node: N.ReturnStmt): R;
  visitBreakStmt(node: N.BreakStmt): R;
  visitContinueStmt(node: N.ContinueStmt): R;
  visitIfStmt(node: N.IfStmt): R;
  visitWhileStmt(node: N.WhileStmt): R;
  visitForStmt(node: N.ForStmt): R;
  visitBlockStmt(node: N.BlockStmt): R;
  visitExprStmt(node: N.ExprStmt): R;
  visitImportStmt(node: N.ImportStmt): R;
  visitExportStmt(node: N.ExportStmt): R;
  visitTestStmt(node: N.TestStmt): R;
  visitAssertStmt(node: N.AssertStmt): R;

  // Expressions
  visitIntLiteral(node: N.IntLiteral): R;
  visitFloatLiteral(node: N.FloatLiteral): R;
  visitStringLiteral(node: N.StringLiteral): R;
  visitBoolLiteral(node: N.BoolLiteral): R;
  visitNullLiteral(node: N.NullLiteral): R;
  visitIdentExpr(node: N.IdentExpr): R;
  visitBinaryExpr(node: N.BinaryExpr): R;
  visitUnaryExpr(node: N.UnaryExpr): R;
  visitCallExpr(node: N.CallExpr): R;
  visitIndexExpr(node: N.IndexExpr): R;
  visitMemberExpr(node: N.MemberExpr): R;
  visitAssignExpr(node: N.AssignExpr): R;
  visitCompoundAssignExpr(node: N.CompoundAssignExpr): R;
  visitArrayExpr(node: N.ArrayExpr): R;
  visitObjectExpr(node: N.ObjectExpr): R;
  visitFunctionExpr(node: N.FunctionExpr): R;
  visitIfExpr(node: N.IfExpr): R;
  visitBlockExpr(node: N.BlockExpr): R;
  visitStructInitExpr(node: N.StructInitExpr): R;
  visitRangeExpr(node: N.RangeExpr): R;
  visitCastExpr(node: N.CastExpr): R;
  visitMatchExpr(node: N.MatchExpr): R;
  visitAwaitExpr(node: N.AwaitExpr): R;
}

// ─── Dispatch helpers ─────────────────────────────────────────────────────────

export function visitStmt<R>(visitor: Visitor<R>, stmt: N.Stmt): R {
  switch (stmt.kind) {
    case "VarDeclStmt":      return visitor.visitVarDeclStmt(stmt);
    case "ConstDeclStmt":    return visitor.visitConstDeclStmt(stmt);
    case "FunctionDeclStmt": return visitor.visitFunctionDeclStmt(stmt);
    case "StructDeclStmt":   return visitor.visitStructDeclStmt(stmt);
    case "ImplBlockStmt":     return visitor.visitImplBlockStmt(stmt);
    case "TraitDeclStmt":    return visitor.visitTraitDeclStmt(stmt);
    case "TypeAliasStmt":    return visitor.visitTypeAliasStmt(stmt);
    case "ReturnStmt":       return visitor.visitReturnStmt(stmt);
    case "BreakStmt":        return visitor.visitBreakStmt(stmt);
    case "ContinueStmt":     return visitor.visitContinueStmt(stmt);
    case "IfStmt":           return visitor.visitIfStmt(stmt);
    case "WhileStmt":        return visitor.visitWhileStmt(stmt);
    case "ForStmt":          return visitor.visitForStmt(stmt);
    case "BlockStmt":        return visitor.visitBlockStmt(stmt);
    case "ExprStmt":         return visitor.visitExprStmt(stmt);
    case "ImportStmt":       return visitor.visitImportStmt(stmt);
    case "ExportStmt":       return visitor.visitExportStmt(stmt);
    case "TestStmt":         return visitor.visitTestStmt(stmt);
    case "AssertStmt":       return visitor.visitAssertStmt(stmt);
  }
}

export function visitExpr<R>(visitor: Visitor<R>, expr: N.Expr): R {
  switch (expr.kind) {
    case "IntLiteral":        return visitor.visitIntLiteral(expr);
    case "FloatLiteral":      return visitor.visitFloatLiteral(expr);
    case "StringLiteral":     return visitor.visitStringLiteral(expr);
    case "BoolLiteral":       return visitor.visitBoolLiteral(expr);
    case "NullLiteral":       return visitor.visitNullLiteral(expr);
    case "IdentExpr":         return visitor.visitIdentExpr(expr);
    case "BinaryExpr":        return visitor.visitBinaryExpr(expr);
    case "UnaryExpr":         return visitor.visitUnaryExpr(expr);
    case "CallExpr":          return visitor.visitCallExpr(expr);
    case "IndexExpr":         return visitor.visitIndexExpr(expr);
    case "MemberExpr":        return visitor.visitMemberExpr(expr);
    case "AssignExpr":        return visitor.visitAssignExpr(expr);
    case "CompoundAssignExpr": return visitor.visitCompoundAssignExpr(expr);
    case "ArrayExpr":         return visitor.visitArrayExpr(expr);
    case "ObjectExpr":        return visitor.visitObjectExpr(expr);
    case "FunctionExpr":      return visitor.visitFunctionExpr(expr);
    case "IfExpr":            return visitor.visitIfExpr(expr);
    case "BlockExpr":         return visitor.visitBlockExpr(expr);
    case "StructInitExpr":    return visitor.visitStructInitExpr(expr);
    case "RangeExpr":         return visitor.visitRangeExpr(expr);
    case "CastExpr":          return visitor.visitCastExpr(expr);
    case "MatchExpr":         return visitor.visitMatchExpr(expr);
    case "AwaitExpr":         return visitor.visitAwaitExpr(expr);
  }
}

// ─── Base visitor (no-op) — subclass and override what you need ───────────────

export abstract class BaseVisitor<R = void> implements Visitor<R> {
  protected abstract defaultResult(): R;
  protected abstract combineResults(a: R, b: R): R;

  visitProgram(node: N.Program): R {
    let result = this.defaultResult();
    for (const stmt of node.statements) {
      result = this.combineResults(result, visitStmt(this, stmt));
    }
    return result;
  }

  visitVarDeclStmt(node: N.VarDeclStmt): R {
    if (node.initializer) return visitExpr(this, node.initializer);
    return this.defaultResult();
  }

  visitConstDeclStmt(node: N.ConstDeclStmt): R {
    return visitExpr(this, node.initializer);
  }

  visitFunctionDeclStmt(node: N.FunctionDeclStmt): R {
    return this.visitBlockStmt(node.body);
  }

  visitStructDeclStmt(_node: N.StructDeclStmt): R {
    return this.defaultResult();
  }

  visitImplBlockStmt(node: N.ImplBlockStmt): R {
    let result = this.defaultResult();
    for (const m of node.methods) {
      result = this.combineResults(result, this.visitFunctionDeclStmt(m));
    }
    return result;
  }

  visitTraitDeclStmt(_node: N.TraitDeclStmt): R {
    return this.defaultResult();
  }

  visitTypeAliasStmt(_node: N.TypeAliasStmt): R {
    return this.defaultResult();
  }

  visitReturnStmt(node: N.ReturnStmt): R {
    if (node.value) return visitExpr(this, node.value);
    return this.defaultResult();
  }

  visitBreakStmt(_node: N.BreakStmt): R { return this.defaultResult(); }
  visitContinueStmt(_node: N.ContinueStmt): R { return this.defaultResult(); }

  visitIfStmt(node: N.IfStmt): R {
    let result = visitExpr(this, node.condition);
    result = this.combineResults(result, this.visitBlockStmt(node.then));
    if (node.else_) {
      result = this.combineResults(
        result,
        node.else_.kind === "BlockStmt"
          ? this.visitBlockStmt(node.else_)
          : this.visitIfStmt(node.else_)
      );
    }
    return result;
  }

  visitWhileStmt(node: N.WhileStmt): R {
    return this.combineResults(
      visitExpr(this, node.condition),
      this.visitBlockStmt(node.body)
    );
  }

  visitForStmt(node: N.ForStmt): R {
    return this.combineResults(
      visitExpr(this, node.iterable),
      this.visitBlockStmt(node.body)
    );
  }

  visitBlockStmt(node: N.BlockStmt): R {
    let result = this.defaultResult();
    for (const stmt of node.body) {
      result = this.combineResults(result, visitStmt(this, stmt));
    }
    return result;
  }

  visitExprStmt(node: N.ExprStmt): R { return visitExpr(this, node.expr); }
  visitImportStmt(_node: N.ImportStmt): R { return this.defaultResult(); }
  visitExportStmt(node: N.ExportStmt): R { return visitStmt(this, node.declaration); }

  visitTestStmt(node: N.TestStmt): R { return this.visitBlockStmt(node.body); }

  visitAssertStmt(node: N.AssertStmt): R {
    let r = visitExpr(this, node.condition);
    if (node.message) r = this.combineResults(r, visitExpr(this, node.message));
    return r;
  }

  // Expressions
  visitIntLiteral(_node: N.IntLiteral): R { return this.defaultResult(); }
  visitFloatLiteral(_node: N.FloatLiteral): R { return this.defaultResult(); }
  visitStringLiteral(_node: N.StringLiteral): R { return this.defaultResult(); }
  visitBoolLiteral(_node: N.BoolLiteral): R { return this.defaultResult(); }
  visitNullLiteral(_node: N.NullLiteral): R { return this.defaultResult(); }
  visitIdentExpr(_node: N.IdentExpr): R { return this.defaultResult(); }

  visitBinaryExpr(node: N.BinaryExpr): R {
    return this.combineResults(
      visitExpr(this, node.left),
      visitExpr(this, node.right)
    );
  }

  visitUnaryExpr(node: N.UnaryExpr): R { return visitExpr(this, node.operand); }

  visitCallExpr(node: N.CallExpr): R {
    let r = visitExpr(this, node.callee);
    for (const arg of node.args) {
      r = this.combineResults(r, visitExpr(this, arg));
    }
    return r;
  }

  visitIndexExpr(node: N.IndexExpr): R {
    return this.combineResults(visitExpr(this, node.object), visitExpr(this, node.index));
  }

  visitMemberExpr(node: N.MemberExpr): R { return visitExpr(this, node.object); }

  visitAssignExpr(node: N.AssignExpr): R {
    return this.combineResults(visitExpr(this, node.target), visitExpr(this, node.value));
  }

  visitCompoundAssignExpr(node: N.CompoundAssignExpr): R {
    return this.combineResults(visitExpr(this, node.target), visitExpr(this, node.value));
  }

  visitArrayExpr(node: N.ArrayExpr): R {
    let r = this.defaultResult();
    for (const el of node.elements) {
      r = this.combineResults(r, visitExpr(this, el));
    }
    return r;
  }

  visitObjectExpr(node: N.ObjectExpr): R {
    let r = this.defaultResult();
    for (const field of node.fields) {
      r = this.combineResults(r, visitExpr(this, field.value));
    }
    return r;
  }

  visitFunctionExpr(node: N.FunctionExpr): R {
    return this.visitBlockStmt(node.body);
  }

  visitIfExpr(node: N.IfExpr): R {
    let r = visitExpr(this, node.condition);
    r = this.combineResults(r, this.visitBlockStmt(node.then));
    if (node.else_) {
      r = this.combineResults(
        r,
        node.else_.kind === "BlockStmt"
          ? this.visitBlockStmt(node.else_)
          : this.visitIfExpr(node.else_)
      );
    }
    return r;
  }

  visitBlockExpr(node: N.BlockExpr): R {
    let r = this.defaultResult();
    for (const stmt of node.body) {
      r = this.combineResults(r, visitStmt(this, stmt));
    }
    return r;
  }

  visitStructInitExpr(node: N.StructInitExpr): R {
    let r = this.defaultResult();
    for (const field of node.fields) {
      r = this.combineResults(r, visitExpr(this, field.value));
    }
    return r;
  }

  visitRangeExpr(node: N.RangeExpr): R {
    return this.combineResults(visitExpr(this, node.start), visitExpr(this, node.end));
  }

  visitCastExpr(node: N.CastExpr): R { return visitExpr(this, node.expr); }

  visitMatchExpr(node: N.MatchExpr): R {
    let r = visitExpr(this, node.scrutinee);
    for (const arm of node.arms) {
      if (arm.guard) r = this.combineResults(r, visitExpr(this, arm.guard));
      if (arm.body.kind === "BlockStmt") {
        r = this.combineResults(r, this.visitBlockStmt(arm.body));
      } else {
        r = this.combineResults(r, visitExpr(this, arm.body));
      }
    }
    return r;
  }

  visitAwaitExpr(node: N.AwaitExpr): R {
    return visitExpr(this, node.expr);
  }
}
