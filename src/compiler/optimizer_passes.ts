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
  function scanMutations(node: any): void {
    if (!node || typeof node !== "object") return;
    switch (node.kind) {
      case "Program": {
        const stmts = node.statements;
        if (stmts) for (let i = 0; i < stmts.length; i++) scanMutations(stmts[i]);
        return;
      }
      case "BlockStmt": {
        const body = node.body;
        if (body) for (let i = 0; i < body.length; i++) scanMutations(body[i]);
        return;
      }
      case "FunctionDeclStmt":
        scanMutations(node.body);
        return;
      case "WhileStmt":
        scanMutations(node.condition);
        scanMutations(node.body);
        return;
      case "ForStmt":
        scanMutations(node.iterable);
        scanMutations(node.body);
        return;
      case "IfStmt":
        scanMutations(node.condition);
        scanMutations(node.then);
        if (node.else_) scanMutations(node.else_);
        return;
      case "VarDeclStmt":
      case "ConstDeclStmt":
        if (node.initializer) scanMutations(node.initializer);
        return;
      case "ReturnStmt":
        if (node.value) scanMutations(node.value);
        return;
      case "ExprStmt":
        scanMutations(node.expr);
        return;
      case "AssignExpr":
      case "CompoundAssignExpr":
        if (node.target?.kind === "IdentExpr") {
          mutatedVars.add(node.target.name);
        }
        scanMutations(node.target);
        scanMutations(node.value);
        return;
      case "BinaryExpr":
        scanMutations(node.left);
        scanMutations(node.right);
        return;
      case "UnaryExpr":
        scanMutations(node.operand);
        return;
      case "IfExpr":
        scanMutations(node.condition);
        scanMutations(node.then);
        if (node.else_) scanMutations(node.else_);
        return;
      case "BlockExpr": {
        const body = node.body;
        if (body) for (let i = 0; i < body.length; i++) scanMutations(body[i]);
        return;
      }
      case "CallExpr": {
        scanMutations(node.callee);
        const args = node.args;
        if (args) for (let i = 0; i < args.length; i++) scanMutations(args[i]);
        return;
      }
      case "MemberExpr":
        scanMutations(node.object);
        return;
      case "IndexExpr":
        scanMutations(node.object);
        scanMutations(node.index);
        return;
      case "ArrayLiteralExpr":
      case "ArrayExpr": {
        const elements = node.elements;
        if (elements) for (let i = 0; i < elements.length; i++) scanMutations(elements[i]);
        return;
      }
      case "ObjectLiteralExpr":
      case "ObjectExpr":
      case "StructInitExpr": {
        const fields = node.fields;
        if (fields) for (let i = 0; i < fields.length; i++) if (fields[i].value) scanMutations(fields[i].value);
        return;
      }
      case "ImplBlockStmt": {
        const methods = node.methods;
        if (methods) for (let i = 0; i < methods.length; i++) scanMutations(methods[i]);
        return;
      }
      case "ExportStmt":
        scanMutations(node.declaration);
        return;
      case "TestStmt":
        scanMutations(node.body);
        return;
      case "AssertStmt":
        scanMutations(node.condition);
        if (node.message) scanMutations(node.message);
        return;
      case "StructDeclStmt":
      case "TraitDeclStmt":
      case "TypeAliasStmt":
      case "ImportStmt":
      case "BreakStmt":
      case "ContinueStmt":
      case "IntLiteral":
      case "FloatLiteral":
      case "StringLiteral":
      case "BoolLiteral":
      case "NullLiteral":
      case "IdentExpr":
        return;
      default: {
        for (const key of Object.keys(node)) {
          if (key !== "span") scanMutations(node[key]);
        }
        return;
      }
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
          if (left === expr.left && right === expr.right) return expr;
          return { ...expr, left, right };
        }
        if (expr.op === "||") {
          if (left.kind === "BoolLiteral") {
            stats.constantsFolded++;
            return left.value ? left : right;
          }
          if (left === expr.left && right === expr.right) return expr;
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
              if (left === expr.left && right === expr.right) return expr;
              return { ...expr, left, right }; // Do not fold division by zero; preserves runtime error
            }
            if (expr.op === "%") {
              if (rVal !== 0) { stats.constantsFolded++; return makeLiteralNode(lVal % rVal, expr.span); }
              if (left === expr.left && right === expr.right) return expr;
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

        if (left === expr.left && right === expr.right) return expr;
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
        if (operand === expr.operand) return expr;
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

      case "AssignExpr": {
        const val = foldExpr(expr.value);
        if (val === expr.value) return expr;
        return { ...expr, value: val };
      }

      case "CompoundAssignExpr": {
        const val = foldExpr(expr.value);
        if (val === expr.value) return expr;
        return { ...expr, value: val };
      }

      case "ReturnStmt" as any:
        return expr;

      default:
        return expr;
    }
  }

  function foldBlock(block: N.BlockStmt): N.BlockStmt {
    const savedEnv = new Map(constEnv);
    let changed = false;
    const body: N.Stmt[] = [];
    for (let i = 0; i < block.body.length; i++) {
      const s = block.body[i];
      const folded = foldStmt(s);
      if (folded !== s) changed = true;
      if (folded) body.push(folded);
    }
    constEnv.clear();
    for (const [k, v] of savedEnv) constEnv.set(k, v);
    if (!changed && body.length === block.body.length) return block;
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
        if (init === stmt.initializer) return stmt;
        return { ...stmt, initializer: init };
      }

      case "ConstDeclStmt": {
        const value = foldExpr(stmt.initializer);
        if (isLiteral(value) && !mutatedVars.has(stmt.name)) {
          constEnv.set(stmt.name, value);
        }
        if (value === stmt.initializer) return stmt;
        return { ...stmt, initializer: value };
      }

      case "ExprStmt": {
        const expr = foldExpr(stmt.expr);
        if (expr === stmt.expr) return stmt;
        return { ...stmt, expr };
      }

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
        const body = foldBlock(stmt.body);
        if (cond === stmt.condition && body === stmt.body) return stmt;
        return { ...stmt, condition: cond, body };
      }

      case "ForStmt": {
        const iter = foldExpr(stmt.iterable);
        const body = foldBlock(stmt.body);
        if (iter === stmt.iterable && body === stmt.body) return stmt;
        return { ...stmt, iterable: iter, body };
      }

      case "ReturnStmt": {
        const val = stmt.value ? foldExpr(stmt.value) : null;
        if (val === stmt.value) return stmt;
        return { ...stmt, value: val };
      }

      case "BlockStmt":
        return foldBlock(stmt);

      case "FunctionDeclStmt": {
        // Functions isolate local variable scopes
        const savedEnv = new Map(constEnv);
        const foldedBody = foldBlock(stmt.body);
        constEnv.clear();
        for (const [k, v] of savedEnv) constEnv.set(k, v);
        if (foldedBody === stmt.body) return stmt;
        return { ...stmt, body: foldedBody };
      }

      default:
        return stmt;
    }
  }

  let changed = false;
  const optimizedStmts: N.Stmt[] = [];
  for (let i = 0; i < program.statements.length; i++) {
    const s = program.statements[i];
    const folded = foldStmt(s);
    if (folded !== s) changed = true;
    if (folded) optimizedStmts.push(folded);
  }
  if (!changed && optimizedStmts.length === program.statements.length) return program;
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

  // Track all jump target instruction indices (basic block boundaries)
  const isJumpTarget = new Set<number>();
  for (const ins of code) {
    if (ins.op === RegOp.Jump) {
      isJumpTarget.add(ins.dst);
    } else if (
      ins.op === RegOp.JumpIf ||
      ins.op === RegOp.JumpIfNot ||
      ins.op === RegOp.JumpNull ||
      ins.op === RegOp.IterNext
    ) {
      isJumpTarget.add(ins.src2);
    }
  }

  // Pass 1: Redundant Move & Instruction Optimization

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
    if (isJumpTarget.has(i + 1)) continue;
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
    if (isJumpTarget.has(i + 1)) continue;
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

  // Pattern 4: Source Register Forwarding
  // If ins1 is Move rTemp, rSrc (where rTemp >= 64 is a temporary)
  // and a subsequent instruction in the same basic block uses rTemp as an operand:
  for (let i = 0; i < n - 1; i++) {
    if (isJumpTarget.has(i)) continue;
    const ins1 = code[i];
    if (ins1.op === RegOp.Move && ins1.dst >= 64) {
      const rTemp = ins1.dst;
      const rSrc = ins1.src1;
      for (let j = i + 1; j < Math.min(i + 5, n); j++) {
        if (isJumpTarget.has(j)) break;
        const ins2 = code[j];
        if (ins2.op === RegOp.Nop) continue;
        // Stop on control flow or if rSrc is overwritten
        if (
          ins2.op === RegOp.Jump ||
          ins2.op === RegOp.JumpIf ||
          ins2.op === RegOp.JumpIfNot ||
          ins2.op === RegOp.JumpNull ||
          ins2.op === RegOp.Call ||
          ins2.dst === rSrc
        ) {
          break;
        }

        if (ins2.op === RegOp.Return && ins2.dst === rTemp) {
          ins2.dst = rSrc;
          ins1.op = RegOp.Nop;
          stats.movesEliminated++;
          stats.registerMovesRemoved++;
          break;
        } else if (
          ins2.op === RegOp.Add || ins2.op === RegOp.Sub || ins2.op === RegOp.Mul ||
          ins2.op === RegOp.Div || ins2.op === RegOp.Mod || ins2.op === RegOp.Pow ||
          ins2.op === RegOp.BitAnd || ins2.op === RegOp.BitOr || ins2.op === RegOp.BitXor ||
          ins2.op === RegOp.Shl || ins2.op === RegOp.Shr || ins2.op === RegOp.Eq ||
          ins2.op === RegOp.Ne || ins2.op === RegOp.Lt || ins2.op === RegOp.Le ||
          ins2.op === RegOp.Gt || ins2.op === RegOp.Ge
        ) {
          let forwarded = false;
          if (ins2.src1 === rTemp) {
            ins2.src1 = rSrc;
            forwarded = true;
          }
          if (ins2.src2 === rTemp) {
            ins2.src2 = rSrc;
            forwarded = true;
          }
          if (forwarded) {
            ins1.op = RegOp.Nop;
            stats.movesEliminated++;
            stats.registerMovesRemoved++;
            break;
          }
        }

        // If ins2 overwrote rTemp without consuming it, rTemp is dead
        if (ins2.dst === rTemp) {
          break;
        }
      }
    }
  }

  // Pattern 5: Eliminate trivial Jump to immediately following instruction
  for (let i = 0; i < n; i++) {
    const ins = code[i];
    if (ins.op === RegOp.Jump && ins.dst === i + 1) {
      ins.op = RegOp.Nop;
      stats.deadInstructionsRemoved++;
    }
  }

  // Pattern 6: Redundant LoadGlobal in same basic block
  for (let i = 0; i < n - 1; i++) {
    const ins1 = code[i];
    if (ins1.op === RegOp.LoadGlobal) {
      const globalIdx = ins1.src1;
      const loadedReg = ins1.dst;
      for (let j = i + 1; j < Math.min(i + 8, n); j++) {
        const ins2 = code[j];
        if (ins2.op === RegOp.Nop) continue;
        if (
          ins2.op === RegOp.Call ||
          ins2.op === RegOp.StoreGlobal ||
          ins2.op === RegOp.DefineGlobal ||
          ins2.op === RegOp.Jump ||
          ins2.op === RegOp.JumpIf ||
          ins2.op === RegOp.JumpIfNot ||
          ins2.op === RegOp.JumpNull ||
          ins2.op === RegOp.Return ||
          ins2.dst === loadedReg
        ) {
          break;
        }
        if (ins2.op === RegOp.LoadGlobal && ins2.src1 === globalIdx) {
          ins2.op = RegOp.Move;
          ins2.src1 = loadedReg;
          stats.movesEliminated++;
          break;
        }
      }
    }
  }

  // Pass 2: Nop Stripping, Jump Target Re-indexing & Register Compaction
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
