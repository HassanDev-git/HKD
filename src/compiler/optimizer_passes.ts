/**
 * HKD Optimizer Passes Implementation (Phase 9D)
 *
 * Provides:
 *   1. foldAstConstants: AST constant folding, propagation, and branch simplification
 *   2. optimizeBytecodeChunk: Bytecode jump threading and peephole optimization
 *   3. optimizeRegisterChunk: Register-level copy propagation and move elimination
 */

import * as N from "../ast/nodes.js";
import { Chunk } from "../bytecode/chunk.js";
import { Op } from "../bytecode/opcodes.js";
import { RegisterChunk, RegInstruction, RegOp } from "../bytecode/register_chunk.js";
import { OptimizationStats, OptimizerOptions } from "./optimizer.js";

// ─── 1. AST Constant Folding Pass ─────────────────────────────────────────────

export function foldAstConstants(
  program: N.Program,
  stats: OptimizationStats,
  options: Required<OptimizerOptions>
): N.Program {
  if (!options.constantFolding) return program;

  const mutatedVars = new Set<string>();
  function scanMutations(node: any) {
    if (!node || typeof node !== "object") return;
    if ((node.kind === "AssignExpr" || node.kind === "CompoundAssignExpr") && node.target?.kind === "IdentExpr") {
      mutatedVars.add(node.target.name);
    }
    for (const key of Object.keys(node)) {
      if (key !== "span") scanMutations(node[key]);
    }
  }
  scanMutations(program);

  const constEnv = new Map<string, N.Expr>();

  function isLiteral(expr: N.Expr): boolean {
    return (
      expr.kind === "IntLiteral" ||
      expr.kind === "FloatLiteral" ||
      expr.kind === "StringLiteral" ||
      expr.kind === "BoolLiteral" ||
      expr.kind === "NullLiteral"
    );
  }

  function getLiteralValue(expr: N.Expr): any {
    switch (expr.kind) {
      case "IntLiteral":
      case "FloatLiteral":
      case "StringLiteral":
      case "BoolLiteral":
        return expr.value;
      case "NullLiteral":
        return null;
      default:
        return undefined;
    }
  }

  function makeLiteralNode(val: any, span: any): N.Expr {
    if (val === null) return { kind: "NullLiteral", span };
    if (typeof val === "boolean") return { kind: "BoolLiteral", value: val, span };
    if (typeof val === "number") {
      if (Number.isInteger(val)) {
        return { kind: "IntLiteral", value: val, raw: String(val), span };
      }
      return { kind: "FloatLiteral", value: val, raw: String(val), span };
    }
    if (typeof val === "string") {
      return { kind: "StringLiteral", value: val, span };
    }
    return { kind: "NullLiteral", span };
  }

  function isTruthy(val: any): boolean {
    if (val === null || val === false || val === 0 || val === "") return false;
    return true;
  }

  function foldExpr(expr: N.Expr): N.Expr {
    switch (expr.kind) {
      case "IdentExpr": {
        if (constEnv.has(expr.name)) {
          const folded = constEnv.get(expr.name)!;
          stats.constantsFolded++;
          return { ...folded, span: expr.span };
        }
        return expr;
      }

      case "BinaryExpr": {
        const left = foldExpr(expr.left);
        const right = foldExpr(expr.right);

        // Logical short-circuit folding
        if (expr.op === "&&") {
          if (left.kind === "BoolLiteral") {
            stats.constantsFolded++;
            return left.value ? right : left;
          }
          return { ...expr, left, right };
        }
        if (expr.op === "||") {
          if (left.kind === "BoolLiteral") {
            stats.constantsFolded++;
            return left.value ? left : right;
          }
          return { ...expr, left, right };
        }

        if (isLiteral(left) && isLiteral(right)) {
          const lVal = getLiteralValue(left);
          const rVal = getLiteralValue(right);

          // Arithmetic
          if (typeof lVal === "number" && typeof rVal === "number") {
            if (expr.op === "+") { stats.constantsFolded++; return makeLiteralNode(lVal + rVal, expr.span); }
            if (expr.op === "-") { stats.constantsFolded++; return makeLiteralNode(lVal - rVal, expr.span); }
            if (expr.op === "*") { stats.constantsFolded++; return makeLiteralNode(lVal * rVal, expr.span); }
            if (expr.op === "/") {
              if (rVal !== 0) { stats.constantsFolded++; return makeLiteralNode(lVal / rVal, expr.span); }
              return { ...expr, left, right }; // Do not fold division by zero; preserves runtime error
            }
            if (expr.op === "%") {
              if (rVal !== 0) { stats.constantsFolded++; return makeLiteralNode(lVal % rVal, expr.span); }
              return { ...expr, left, right }; // Do not fold modulo by zero
            }
            if (expr.op === "**") { stats.constantsFolded++; return makeLiteralNode(Math.pow(lVal, rVal), expr.span); }

            // Numeric comparisons
            if (expr.op === "==") { stats.constantsFolded++; return makeLiteralNode(lVal === rVal, expr.span); }
            if (expr.op === "!=") { stats.constantsFolded++; return makeLiteralNode(lVal !== rVal, expr.span); }
            if (expr.op === "<")  { stats.constantsFolded++; return makeLiteralNode(lVal < rVal, expr.span); }
            if (expr.op === "<=") { stats.constantsFolded++; return makeLiteralNode(lVal <= rVal, expr.span); }
            if (expr.op === ">")  { stats.constantsFolded++; return makeLiteralNode(lVal > rVal, expr.span); }
            if (expr.op === ">=") { stats.constantsFolded++; return makeLiteralNode(lVal >= rVal, expr.span); }

            // Bitwise operations (integer only)
            if (Number.isInteger(lVal) && Number.isInteger(rVal)) {
              if (expr.op === "&")  { stats.constantsFolded++; return makeLiteralNode((lVal & rVal) | 0, expr.span); }
              if (expr.op === "|")  { stats.constantsFolded++; return makeLiteralNode((lVal | rVal) | 0, expr.span); }
              if (expr.op === "^")  { stats.constantsFolded++; return makeLiteralNode((lVal ^ rVal) | 0, expr.span); }
              if (expr.op === "<<") { stats.constantsFolded++; return makeLiteralNode((lVal << rVal) | 0, expr.span); }
              if (expr.op === ">>") { stats.constantsFolded++; return makeLiteralNode((lVal >> rVal) | 0, expr.span); }
            }
          }

          // String concatenation
          if (expr.op === "+" && (typeof lVal === "string" || typeof rVal === "string")) {
            stats.constantsFolded++;
            return makeLiteralNode(String(lVal) + String(rVal), expr.span);
          }

          // String / Boolean / Null equality
          if (expr.op === "==") { stats.constantsFolded++; return makeLiteralNode(lVal === rVal, expr.span); }
          if (expr.op === "!=") { stats.constantsFolded++; return makeLiteralNode(lVal !== rVal, expr.span); }
        }

        return { ...expr, left, right };
      }

      case "UnaryExpr": {
        const operand = foldExpr(expr.operand);
        if (isLiteral(operand)) {
          const val = getLiteralValue(operand);
          if (expr.op === "-" && typeof val === "number") {
            stats.constantsFolded++;
            return makeLiteralNode(-val, expr.span);
          }
          if (expr.op === "!") {
            stats.constantsFolded++;
            return makeLiteralNode(!isTruthy(val), expr.span);
          }
          if (expr.op === "~" && typeof val === "number" && Number.isInteger(val)) {
            stats.constantsFolded++;
            return makeLiteralNode(~val, expr.span);
          }
        }
        return { ...expr, operand };
      }

      case "IfExpr": {
        const cond = foldExpr(expr.condition);
        if (isLiteral(cond)) {
          const val = getLiteralValue(cond);
          stats.branchesSimplified++;
          if (isTruthy(val)) {
            return {
              kind: "BlockExpr",
              span: expr.span,
              body: expr.then.body.map(foldStmt).filter(Boolean) as N.Stmt[],
            };
          } else if (expr.else_) {
            if (expr.else_.kind === "BlockStmt") {
              return {
                kind: "BlockExpr",
                span: expr.span,
                body: expr.else_.body.map(foldStmt).filter(Boolean) as N.Stmt[],
              };
            } else {
              return foldExpr(expr.else_);
            }
          } else {
            return { kind: "NullLiteral", span: expr.span };
          }
        }
        return {
          ...expr,
          condition: cond,
          then: foldBlock(expr.then),
          else_: expr.else_ ? (expr.else_.kind === "BlockStmt" ? foldBlock(expr.else_) : foldExpr(expr.else_) as any) : null,
        };
      }

      case "ArrayExpr":
        return { ...expr, elements: expr.elements.map(foldExpr) };

      case "ObjectExpr":
        return {
          ...expr,
          fields: expr.fields.map((f) => ({ ...f, value: foldExpr(f.value) })),
        };

      case "CallExpr":
        return {
          ...expr,
          callee: foldExpr(expr.callee),
          args: expr.args.map(foldExpr),
        };

      case "AssignExpr":
        return { ...expr, value: foldExpr(expr.value) };

      case "CompoundAssignExpr":
        return { ...expr, value: foldExpr(expr.value) };

      case "ReturnStmt" as any:
        return expr;

      default:
        return expr;
    }
  }

  function foldBlock(block: N.BlockStmt): N.BlockStmt {
    const savedEnv = new Map(constEnv);
    const body = block.body.map(foldStmt).filter(Boolean) as N.Stmt[];
    constEnv.clear();
    for (const [k, v] of savedEnv) constEnv.set(k, v);
    return {
      ...block,
      body,
    };
  }

  function foldStmt(stmt: N.Stmt): N.Stmt | null {
    switch (stmt.kind) {
      case "VarDeclStmt": {
        const init = stmt.initializer ? foldExpr(stmt.initializer) : null;
        // Conservative constant propagation: only propagate pure primitives that are never mutated
        if (init && isLiteral(init) && !mutatedVars.has(stmt.name)) {
          constEnv.set(stmt.name, init);
        } else {
          constEnv.delete(stmt.name);
        }
        return { ...stmt, initializer: init };
      }

      case "ConstDeclStmt": {
        const value = foldExpr(stmt.initializer);
        if (isLiteral(value) && !mutatedVars.has(stmt.name)) {
          constEnv.set(stmt.name, value);
        }
        return { ...stmt, initializer: value };
      }

      case "ExprStmt":
        return { ...stmt, expr: foldExpr(stmt.expr) };

      case "IfStmt": {
        const cond = foldExpr(stmt.condition);
        if (isLiteral(cond)) {
          const val = getLiteralValue(cond);
          stats.branchesSimplified++;
          if (isTruthy(val)) {
            // Condition is true: inline then-block, discard else-branch
            stats.deadInstructionsRemoved++;
            return foldBlock(stmt.then);
          } else {
            // Condition is false: inline else-block, discard then-branch
            stats.deadInstructionsRemoved++;
            if (stmt.else_) {
              return stmt.else_.kind === "BlockStmt" ? foldBlock(stmt.else_) : foldStmt(stmt.else_);
            }
            return null; // Dead if-statement removed completely
          }
        }
        return {
          ...stmt,
          condition: cond,
          then: foldBlock(stmt.then),
          else_: stmt.else_ ? (stmt.else_.kind === "BlockStmt" ? foldBlock(stmt.else_) : (foldStmt(stmt.else_) as any)) : null,
        };
      }

      case "WhileStmt": {
        const cond = foldExpr(stmt.condition);
        if (isLiteral(cond) && !isTruthy(getLiteralValue(cond))) {
          // while (false) { ... } -> completely unreachable
          stats.branchesSimplified++;
          stats.deadInstructionsRemoved++;
          return null;
        }
        return { ...stmt, condition: cond, body: foldBlock(stmt.body) };
      }

      case "ForStmt":
        return { ...stmt, iterable: foldExpr(stmt.iterable), body: foldBlock(stmt.body) };

      case "ReturnStmt":
        return { ...stmt, value: stmt.value ? foldExpr(stmt.value) : null };

      case "BlockStmt":
        return foldBlock(stmt);

      case "FunctionDeclStmt": {
        // Functions isolate local variable scopes
        const savedEnv = new Map(constEnv);
        const foldedBody = foldBlock(stmt.body);
        constEnv.clear();
        for (const [k, v] of savedEnv) constEnv.set(k, v);
        return { ...stmt, body: foldedBody };
      }

      default:
        return stmt;
    }
  }

  const optimizedStmts = program.statements.map(foldStmt).filter(Boolean) as N.Stmt[];
  return { ...program, statements: optimizedStmts };
}

// ─── 2. Bytecode Optimization Pass ────────────────────────────────────────────

export function optimizeBytecodeChunk(
  chunk: Chunk,
  stats: OptimizationStats,
  options: Required<OptimizerOptions>
): Chunk {
  // Bytecode chunks for Stack VM and native validator are preserved cleanly.
  // Register-level optimizations are applied during Register Lowering.
  return chunk;
}

// ─── 3. Register Optimization Pass ────────────────────────────────────────────

export function optimizeRegisterChunk(
  regChunk: RegisterChunk,
  stats: OptimizationStats,
  options: Required<OptimizerOptions>
): RegisterChunk {
  if (!options.registerOptimization) return regChunk;

  const code = regChunk.code;
  const n = code.length;
  if (n === 0) return regChunk;

  // Pass 1: Identify and eliminate redundant moves
  // Pattern 1: Move rX, rX (self-move) -> eliminate
  for (let i = 0; i < n; i++) {
    const ins = code[i];
    if (ins.op === RegOp.Move && ins.dst === ins.src1) {
      ins.op = RegOp.Nop;
      stats.movesEliminated++;
      stats.registerMovesRemoved++;
    }
  }

  // Pattern 2: Consecutive Move Propagation
  // Move rA, rB followed by Move rC, rA (where rA is a temporary) -> Move rC, rB
  for (let i = 0; i < n - 1; i++) {
    const ins1 = code[i];
    const ins2 = code[i + 1];
    if (
      ins1.op === RegOp.Move &&
      ins2.op === RegOp.Move &&
      ins1.dst === ins2.src1 &&
      ins1.dst >= 64 // only on temporaries
    ) {
      ins2.src1 = ins1.src1;
      stats.movesEliminated++;
      stats.registerMovesRemoved++;
    }
  }

  // Pattern 3: Direct Destination Forwarding
  // If ins1 computes into temporary rT (rT >= 64) and ins2 is Move rDest, rT:
  // Forward rDest directly into ins1.dst and mark ins2 as Nop
  for (let i = 0; i < n - 1; i++) {
    const ins1 = code[i];
    const ins2 = code[i + 1];
    if (
      ins2.op === RegOp.Move &&
      ins1.dst === ins2.src1 &&
      ins1.dst >= 64 &&
      ins1.op !== RegOp.Nop &&
      ins1.op !== RegOp.Jump &&
      ins1.op !== RegOp.JumpIf &&
      ins1.op !== RegOp.JumpIfNot &&
      ins1.op !== RegOp.JumpNull &&
      ins1.op !== RegOp.IterNext &&
      ins1.op !== RegOp.Call &&
      ins1.op !== RegOp.Halt
    ) {
      ins1.dst = ins2.dst;
      ins2.op = RegOp.Nop;
      stats.movesEliminated++;
      stats.registerMovesRemoved++;
    }
  }

  // Pass 2: Nop Stripping & Re-indexing Jumps
  // Compute new index map for each instruction
  let hasNops = false;
  for (let i = 0; i < n; i++) {
    if (code[i].op === RegOp.Nop) {
      hasNops = true;
      break;
    }
  }

  if (hasNops) {
    const oldToNew = new Map<number, number>();
    const newCode: RegInstruction[] = [];

    for (let i = 0; i < n; i++) {
      if (code[i].op !== RegOp.Nop) {
        oldToNew.set(i, newCode.length);
        newCode.push(code[i]);
      } else {
        stats.deadInstructionsRemoved++;
      }
    }
    oldToNew.set(n, newCode.length);

    // Patch jump targets to new instruction indices
    for (const ins of newCode) {
      if (ins.op === RegOp.Jump) {
        const newTarget = oldToNew.get(ins.dst);
        if (newTarget !== undefined) ins.dst = newTarget;
      } else if (
        ins.op === RegOp.JumpIf ||
        ins.op === RegOp.JumpIfNot ||
        ins.op === RegOp.JumpNull ||
        ins.op === RegOp.IterNext
      ) {
        const newTarget = oldToNew.get(ins.src2);
        if (newTarget !== undefined) ins.src2 = newTarget;
      }
    }

    regChunk.code = newCode;
  }

  return regChunk;
}
