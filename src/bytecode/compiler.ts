/**
 * HKD Bytecode Compiler
 *
 * Walks the AST and emits HKD bytecode into Chunks.
 *
 * Design:
 *   - One Chunk per function (including top-level script)
 *   - Locals tracked in a slot array (stack-based allocation)
 *   - Globals for top-level declarations
 *   - Break/continue patching via backpatch lists
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as N from "../ast/nodes.js";
import { Op } from "./opcodes.js";
import { Chunk, HkdFunction, HkdValue } from "./chunk.js";
import { ErrorCode, ErrorReporter } from "../errors/index.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { desugarAsyncFunction, desugarAsyncFunctionExpr } from "./async_lowering.js";

// ─── Local variable slot ──────────────────────────────────────────────────────

interface Local {
  name: string;
  depth: number;    // scope depth when defined
  captured: boolean;
}

// ─── Loop context for break/continue patching ────────────────────────────────

interface LoopContext {
  start: number;           // bytecode offset of loop start
  breakPatches: number[];  // jump placeholders to patch on break
}

// ─── Compiler frame (one per function) ───────────────────────────────────────

class CompilerFrame {
  public chunk: Chunk;
  public locals: Local[] = [];
  public scopeDepth: number = 0;
  public loops: LoopContext[] = [];
  public upvalues: Array<{ isLocal: boolean; index: number }> = [];

  constructor(name: string, arity: number) {
    this.chunk = new Chunk(name, arity);
  }

  defineLocal(name: string): number {
    const slot = this.locals.length;
    this.locals.push({ name, depth: this.scopeDepth, captured: false });
    this.chunk.localCount = Math.max(this.chunk.localCount, this.locals.length);
    return slot;
  }

  resolveLocal(name: string): number {
    for (let i = this.locals.length - 1; i >= 0; i--) {
      if (this.locals[i].name === name) return i;
    }
    return -1;
  }

  addUpvalue(isLocal: boolean, index: number): number {
    for (let i = 0; i < this.upvalues.length; i++) {
      const uv = this.upvalues[i];
      if (uv.isLocal === isLocal && uv.index === index) return i;
    }
    this.upvalues.push({ isLocal, index });
    this.chunk.upvalueCount = this.upvalues.length;
    return this.upvalues.length - 1;
  }

  beginScope(): void { this.scopeDepth++; }

  /**
   * Remove the most recently defined local from bookkeeping without emitting
   * any code. Used when the caller has already emitted the pop for a local that
   * must not also be freed by endScope (e.g. the loop variable in a for loop).
   */
  discardLocal(): void {
    if (this.locals.length > 0) this.locals.pop();
  }

  endScope(chunk: Chunk, line: number): void {
    this.scopeDepth--;
    // Pop all locals defined in this scope
    while (
      this.locals.length > 0 &&
      this.locals[this.locals.length - 1].depth > this.scopeDepth
    ) {
      const local = this.locals.pop()!;
      if (local.captured) {
        chunk.writeByte(Op.CloseUpvalue, line);
      } else {
        chunk.writeByte(Op.Pop, line);
      }
    }
  }

  pushLoop(start: number): void {
    this.loops.push({ start, breakPatches: [] });
  }

  popLoop(chunk: Chunk): void {
    const loop = this.loops.pop()!;
    for (const patch of loop.breakPatches) {
      chunk.patchJump(patch);
    }
  }

  currentLoop(): LoopContext | null {
    return this.loops[this.loops.length - 1] ?? null;
  }
}

// ─── Compiler ─────────────────────────────────────────────────────────────────

export class Compiler {
  private frames: CompilerFrame[] = [];
  private reporter: ErrorReporter;
  private isModule: boolean;
  private methodToStruct: Map<string, Set<string>> = new Map();
  private genericFunctions: Map<string, N.FunctionDeclStmt> = new Map();
  private compiledSpecializations: Set<string> = new Set();
  private currentSpecializedReceiverStruct: string | null = null;
  private currentStruct: string | null = null;
  private loadedImportPaths: Set<string> = new Set();

  constructor(reporter: ErrorReporter, isModule = false) {
    this.reporter = reporter;
    this.isModule = isModule;
  }

  private loadImportedAst(sourcePath: string): N.Program | null {
    try {
      const currentFile = (this.reporter as any).fileName;
      const baseDir = currentFile ? path.dirname(currentFile) : process.cwd();
      let resolved = path.resolve(baseDir, sourcePath);
      if (!fs.existsSync(resolved) && !resolved.endsWith(".hkd")) {
        resolved = resolved + ".hkd";
      }
      if (!fs.existsSync(resolved) || this.loadedImportPaths.has(resolved)) return null;
      this.loadedImportPaths.add(resolved);

      const fileContent = fs.readFileSync(resolved, "utf-8");
      const subReporter = new ErrorReporter(fileContent, resolved);
      const lexer = new Lexer(fileContent, resolved, subReporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, fileContent, resolved, subReporter, "2027");
      return parser.parse();
    } catch {
      return null;
    }
  }

  private scanImportedAst(sourcePath: string, currentDir?: string): void {
    const defaultBase = (this.reporter as any).fileName ? path.dirname((this.reporter as any).fileName) : process.cwd();
    const baseDir = currentDir ?? defaultBase;
    let resolved = path.resolve(baseDir, sourcePath);
    if (!fs.existsSync(resolved) && !resolved.endsWith(".hkd")) {
      resolved = resolved + ".hkd";
    }
    if (!fs.existsSync(resolved) || this.loadedImportPaths.has(resolved)) return;
    this.loadedImportPaths.add(resolved);

    let ast: N.Program;
    try {
      const fileContent = fs.readFileSync(resolved, "utf-8");
      const subReporter = new ErrorReporter(fileContent, resolved);
      const lexer = new Lexer(fileContent, resolved, subReporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, fileContent, resolved, subReporter, "2027");
      ast = parser.parse();
    } catch {
      return;
    }

    const nextBase = path.dirname(resolved);
    for (const stmt of ast.statements) {
      if (stmt.kind === "ImportStmt") {
        this.scanImportedAst(stmt.source, nextBase);
      }
      const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
      if (decl.kind === "ImplBlockStmt") {
        for (const m of decl.methods) {
          if (!this.methodToStruct.has(m.name)) {
            this.methodToStruct.set(m.name, new Set());
          }
          this.methodToStruct.get(m.name)!.add(decl.structName);
        }
      } else if (decl.kind === "FunctionDeclStmt") {
        if (decl.typeParams && decl.typeParams.length > 0) {
          this.genericFunctions.set(decl.name, decl);
        }
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  compile(program: N.Program): Chunk {
    // Pre-scan impl blocks for method resolution and generic functions
    for (const stmt of program.statements) {
      if (stmt.kind === "ImportStmt") {
        this.scanImportedAst(stmt.source);
      }
      const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
      if (decl.kind === "ImplBlockStmt") {
        for (const m of decl.methods) {
          if (!this.methodToStruct.has(m.name)) {
            this.methodToStruct.set(m.name, new Set());
          }
          this.methodToStruct.get(m.name)!.add(decl.structName);
        }
      } else if (decl.kind === "FunctionDeclStmt") {
        if (decl.typeParams && decl.typeParams.length > 0) {
          this.genericFunctions.set(decl.name, decl);
        }
      }
    }

    const frame = new CompilerFrame("<script>", 0);
    this.frames.push(frame);

    for (const stmt of program.statements) {
      this.compileStmt(stmt);
    }

    this.emit(Op.Halt, 0);
    const result = frame.chunk;
    this.frames.pop();
    return result;
  }

  // ── Frame helpers ──────────────────────────────────────────────────────────

  private get frame(): CompilerFrame {
    return this.frames[this.frames.length - 1];
  }

  private get chunk(): Chunk {
    return this.frame.chunk;
  }

  private emit(op: Op, line: number): void {
    this.chunk.writeByte(op, line);
  }

  private emitU16(op: Op, operand: number, line: number): void {
    this.chunk.writeByte(op, line);
    this.chunk.writeU16(operand, line);
  }

  private emitConst(value: HkdValue, line: number): void {
    this.chunk.emitConstant(value, line);
  }

  private emitJump(op: Op, line: number): number {
    return this.chunk.emitJump(op, line);
  }

  private patchJump(offset: number): void {
    this.chunk.patchJump(offset);
  }

  private line(node: N.AstNode): number {
    return node.span.start.line;
  }

  // ── Name constant helpers ─────────────────────────────────────────────────

  private nameConst(name: string): number {
    return this.chunk.addConstant(name);
  }

  // ── Statement compilation ─────────────────────────────────────────────────

  private compileStmt(stmt: N.Stmt): void {
    switch (stmt.kind) {
      case "VarDeclStmt":      this.compileVarDecl(stmt); break;
      case "ConstDeclStmt":    this.compileConstDecl(stmt); break;
      case "FunctionDeclStmt": this.compileFunctionDecl(stmt); break;
      case "StructDeclStmt":   this.compileStructDecl(stmt); break;
      case "ImplBlockStmt":    this.compileImplBlock(stmt); break;
      case "TraitDeclStmt":    break; // compile-time only
      case "TypeAliasStmt":    break; // compile-time only
      case "ReturnStmt":       this.compileReturn(stmt); break;
      case "BreakStmt":        this.compileBreak(stmt); break;
      case "ContinueStmt":     this.compileContinue(stmt); break;
      case "IfStmt":           this.compileIfStmt(stmt); break;
      case "WhileStmt":        this.compileWhile(stmt); break;
      case "ForStmt":          this.compileFor(stmt); break;
      case "BlockStmt":        this.compileBlock(stmt); break;
      case "ExprStmt":         this.compileExprStmt(stmt); break;
      case "ImportStmt":       this.compileImport(stmt); break;
      case "ExportStmt":       this.compileStmt(stmt.declaration); break;
      case "TestStmt":         this.compileTest(stmt); break;
      case "AssertStmt":       this.compileAssert(stmt); break;
    }
  }

  private compileVarDecl(stmt: N.VarDeclStmt): void {
    const l = this.line(stmt);
    if (stmt.initializer) {
      this.compileExpr(stmt.initializer);
    } else {
      this.emit(Op.LoadNull, l);
    }
    this.declareVariable(stmt.name, l, true);
  }

  private compileConstDecl(stmt: N.ConstDeclStmt): void {
    const l = this.line(stmt);
    this.compileExpr(stmt.initializer);
    this.declareVariable(stmt.name, l, false);
  }

  private compileFunctionDecl(stmt: N.FunctionDeclStmt): void {
    if (stmt.isAsync) {
      const lowered = desugarAsyncFunction(stmt);
      this.compileFunctionDecl(lowered);
      return;
    }
    const l = this.line(stmt);
    const { fn, upvalues } = this.compileFunction(
      stmt.name,
      stmt.params,
      stmt.body,
      l
    );
    this.emitClosure(fn, upvalues, l);
    this.declareVariable(stmt.name, l, false);
  }

  private compileFunction(
    name: string,
    params: N.Param[],
    body: N.BlockStmt,
    line: number
  ): { fn: HkdFunction; upvalues: Array<{ isLocal: boolean; index: number }> } {
    const childFrame = new CompilerFrame(name, params.length);
    this.frames.push(childFrame);

    // Define 'self' as slot 0 for methods (skip for now - treated as regular functions)
    // Define params as locals
    for (const param of params) {
      childFrame.defineLocal(param.name);
    }

    childFrame.beginScope();
    for (const stmt of body.body) {
      this.compileStmt(stmt);
    }
    childFrame.endScope(childFrame.chunk, line);

    // Implicit return null if no explicit return
    this.emit(Op.LoadNull, line);
    this.emit(Op.Return, line);

    const chunk = childFrame.chunk;
    const upvalues = childFrame.upvalues;
    this.frames.pop();

    const fn: HkdFunction = {
      type: "function",
      name,
      arity: params.length,
      chunk,
      upvalueCount: upvalues.length,
    };

    return { fn, upvalues };
  }

  /**
   * Emit the value for a function value. Functions with no captured upvalues are
   * emitted as a plain constant; functions that capture upvalues are emitted via
   * MAKE_CLOSURE together with their upvalue descriptors so the VM can bind the
   * captured variables at closure-creation time.
   */
  private emitClosure(
    fn: HkdFunction,
    upvalues: Array<{ isLocal: boolean; index: number }>,
    line: number
  ): void {
    if (upvalues.length === 0) {
      this.emitConst(fn, line);
      return;
    }
    const fnIdx = this.chunk.addConstant(fn);
    this.chunk.writeByte(Op.MakeClosure, line);
    this.chunk.writeU16(fnIdx, line);
    this.chunk.writeByte(upvalues.length, line);
    for (const uv of upvalues) {
      this.chunk.writeByte(uv.isLocal ? 1 : 0, line);
      this.chunk.writeU16(uv.index, line);
    }
  }

  private compileStructDecl(_stmt: N.StructDeclStmt): void {
    // Structs are defined as runtime constructors
    // The VM will create instances via MAKE_OBJECT
    // TODO: Proper struct runtime representation
  }

  private compileImplBlock(stmt: N.ImplBlockStmt): void {
    const l = this.line(stmt);
    const prevStruct = this.currentStruct;
    this.currentStruct = stmt.structName;
    for (const method of stmt.methods) {
      const effectiveMethod = method.isAsync ? desugarAsyncFunction(method) : method;
      const mangledName = `${stmt.structName}__${effectiveMethod.name}`;
      const { fn, upvalues } = this.compileFunction(
        mangledName,
        effectiveMethod.params,
        effectiveMethod.body,
        l
      );
      this.emitClosure(fn, upvalues, l);
      this.declareVariable(mangledName, l, false);
    }
    this.currentStruct = prevStruct;
  }

  private compileReturn(stmt: N.ReturnStmt): void {
    const l = this.line(stmt);
    if (stmt.value) {
      this.compileExpr(stmt.value);
    } else {
      this.emit(Op.LoadNull, l);
    }
    this.emit(Op.Return, l);
  }

  private compileBreak(stmt: N.BreakStmt): void {
    const l = this.line(stmt);
    const loop = this.frame.currentLoop();
    if (!loop) {
      this.reporter.error(ErrorCode.E306, "`break` outside loop", stmt.span);
      return;
    }
    // Close any locals that are in scope
    const patch = this.emitJump(Op.Jump, l);
    loop.breakPatches.push(patch);
  }

  private compileContinue(stmt: N.ContinueStmt): void {
    const l = this.line(stmt);
    const loop = this.frame.currentLoop();
    if (!loop) {
      this.reporter.error(ErrorCode.E306, "`continue` outside loop", stmt.span);
      return;
    }
    // Jump back to loop start
    this.chunk.emitLoop(loop.start, l);
  }

  private compileIfStmt(stmt: N.IfStmt): void {
    const l = this.line(stmt);
    this.compileExpr(stmt.condition);

    const elseJump = this.emitJump(Op.JumpFalse, l);
    this.emit(Op.Pop, l); // pop condition

    this.compileBlock(stmt.then);

    if (stmt.else_) {
      const endJump = this.emitJump(Op.Jump, l);
      this.patchJump(elseJump);
      this.emit(Op.Pop, l); // pop condition on else path

      if (stmt.else_.kind === "IfStmt") {
        this.compileIfStmt(stmt.else_);
      } else {
        this.compileBlock(stmt.else_);
      }
      this.patchJump(endJump);
    } else {
      const endJump = this.emitJump(Op.Jump, l);
      this.patchJump(elseJump);
      this.emit(Op.Pop, l); // pop condition
      this.patchJump(endJump);
    }
  }

  private compileWhile(stmt: N.WhileStmt): void {
    const l = this.line(stmt);
    const loopStart = this.chunk.code.length;
    this.frame.pushLoop(loopStart);

    this.compileExpr(stmt.condition);
    const exitJump = this.emitJump(Op.JumpFalse, l);
    this.emit(Op.Pop, l); // pop condition

    this.frame.beginScope();
    for (const s of stmt.body.body) this.compileStmt(s);
    this.frame.endScope(this.chunk, l);

    this.chunk.emitLoop(loopStart, l);

    this.patchJump(exitJump);
    this.emit(Op.Pop, l); // pop condition on exit

    this.frame.popLoop(this.chunk);
  }

  private compileFor(stmt: N.ForStmt): void {
    const l = this.line(stmt);

    // Enter the loop-variable scope and CLAIM its stack slot with a placeholder.
    // The iterator is created AFTER this placeholder so it sits ABOVE the local
    // slot. Otherwise STORE_LOCAL would write into the same stack cell the
    // iterator occupies (they both start at slot 0 at top-level), overwriting it.
    this.frame.beginScope();
    const slot = this.frame.defineLocal(stmt.variable);
    this.emit(Op.LoadNull, l);

    // Evaluate iterable and make iterator
    this.compileExpr(stmt.iterable);
    this.emit(Op.MakeIter, l);
    this.frame.defineLocal("$iter");

    const loopStart = this.chunk.code.length;
    this.frame.pushLoop(loopStart);

    // IterNext: advance; if done jump to end
    const exitJump = this.chunk.emitJump(Op.IterNext, l);

    // Define loop variable: store the value yielded onto the stack by ITER_NEXT
    // into the reserved local slot, then drop the stray copy on top
    this.emitU16(Op.StoreLocal, slot, l);
    this.emit(Op.Pop, l);

    this.frame.beginScope();
    for (const s of stmt.body.body) this.compileStmt(s);
    this.frame.endScope(this.chunk, l);

    this.chunk.emitLoop(loopStart, l);
    this.patchJump(exitJump);

    // On a normal (done) exit ITER_NEXT already popped the iterator, so the
    // loop-variable value is now on top of the stack — pop it here.
    this.emit(Op.Pop, l);
    this.frame.discardLocal();
    this.frame.discardLocal();
    this.frame.endScope(this.chunk, l);

    this.frame.popLoop(this.chunk);
  }

  private compileBlock(block: N.BlockStmt): void {
    const l = this.line(block);
    this.frame.beginScope();
    for (const stmt of block.body) this.compileStmt(stmt);
    this.frame.endScope(this.chunk, l);
  }

  private compileExprStmt(stmt: N.ExprStmt): void {
    this.compileExpr(stmt.expr);
    // Pop result of expression statements (unless void call)
    this.emit(Op.Pop, this.line(stmt));
  }

  private compileImport(stmt: N.ImportStmt): void {
    const l = this.line(stmt);
    // The VM's CALL convention is [callee, arg1, ... argN], so push the callee
    // (__import__) first, then the module-path argument.
    const nameIdx = this.nameConst("__import__");
    this.emitU16(Op.LoadGlobal, nameIdx, l);
    this.emitConst(stmt.source, l);
    this.emit(Op.Call, l);
    this.chunk.writeByte(1, l); // argc = 1

    if (stmt.specifiers && stmt.specifiers.length > 0) {
      for (let i = 0; i < stmt.specifiers.length; i++) {
        const spec = stmt.specifiers[i];
        const isLast = i === stmt.specifiers.length - 1 && !stmt.defaultName;
        if (!isLast) {
          this.emit(Op.Dup, l);
        }
        this.emitU16(Op.GetField, this.nameConst(spec.name), l);
        this.declareVariable(spec.alias ?? spec.name, l, false);
      }
    }

    if (stmt.defaultName) {
      this.declareVariable(stmt.defaultName, l, false);
    } else if (!stmt.specifiers || stmt.specifiers.length === 0) {
      this.emit(Op.Pop, l);
    }
  }

  private compileTest(stmt: N.TestStmt): void {
    // Test blocks compile to function bodies registered with the test runner
    const l = this.line(stmt);
    const registerIdx = this.nameConst("__register_test__");
    this.emitU16(Op.LoadGlobal, registerIdx, l);
    const { fn, upvalues } = this.compileFunction(
      `test:${stmt.description}`,
      [],
      stmt.body,
      l
    );
    this.emitClosure(fn, upvalues, l);
    this.emitConst(stmt.description, l);
    this.emit(Op.Call, l);
    this.chunk.writeByte(2, l);
    this.emit(Op.Pop, l);
  }

  private compileAssert(stmt: N.AssertStmt): void {
    const l = this.line(stmt);
    const assertIdx = this.nameConst("__assert__");
    this.emitU16(Op.LoadGlobal, assertIdx, l);
    this.compileExpr(stmt.condition);
    if (stmt.message) {
      this.compileExpr(stmt.message);
    } else {
      this.emitConst("Assertion failed", l);
    }
    this.emit(Op.Call, l);
    this.chunk.writeByte(2, l);
    this.emit(Op.Pop, l);
  }

  // ── Expression compilation ────────────────────────────────────────────────

  private compileExpr(expr: N.Expr): void {
    const l = this.line(expr);

    switch (expr.kind) {
      case "IntLiteral":
        this.emitConst(expr.value, l);
        break;

      case "FloatLiteral":
        this.emitConst(expr.value, l);
        break;

      case "StringLiteral":
        this.emitConst(expr.value, l);
        break;

      case "BoolLiteral":
        this.emit(expr.value ? Op.LoadTrue : Op.LoadFalse, l);
        break;

      case "NullLiteral":
        this.emit(Op.LoadNull, l);
        break;

      case "IdentExpr":
        this.compileIdentLoad(expr.name, l);
        break;

      case "BinaryExpr":
        this.compileBinary(expr);
        break;

      case "UnaryExpr":
        this.compileUnary(expr);
        break;

      case "CallExpr":
        this.compileCall(expr);
        break;

      case "IndexExpr":
        this.compileExpr(expr.object);
        this.compileExpr(expr.index);
        this.emit(Op.GetIndex, l);
        break;

      case "MemberExpr":
        this.compileExpr(expr.object);
        this.emitU16(Op.GetField, this.nameConst(expr.property), l);
        break;

      case "AssignExpr":
        this.compileAssign(expr);
        break;

      case "CompoundAssignExpr":
        this.compileCompoundAssign(expr);
        break;

      case "ArrayExpr":
        for (const el of expr.elements) this.compileExpr(el);
        this.emitU16(Op.MakeArray, expr.elements.length, l);
        break;

      case "ObjectExpr":
        for (const field of expr.fields) {
          this.emitConst(field.key, l);
          this.compileExpr(field.value);
        }
        this.emitU16(Op.MakeObject, expr.fields.length, l);
        break;

      case "FunctionExpr": {
        if (expr.isAsync) {
          const lowered = desugarAsyncFunctionExpr(expr);
          this.compileExpr(lowered);
          break;
        }
        const { fn, upvalues } = this.compileFunction(
          "<anonymous>",
          expr.params,
          expr.body,
          l
        );
        this.emitClosure(fn, upvalues, l);
        break;
      }

      case "IfExpr":
        this.compileIfExpr(expr);
        break;

      case "BlockExpr": {
        this.frame.beginScope();
        const stmts = expr.body;
        for (let i = 0; i < stmts.length - 1; i++) {
          this.compileStmt(stmts[i]);
        }
        const last = stmts[stmts.length - 1];
        if (last) {
          if (last.kind === "ExprStmt") {
            this.compileExpr(last.expr); // leave value on stack
          } else {
            this.compileStmt(last);
            this.emit(Op.LoadNull, l);
          }
        } else {
          this.emit(Op.LoadNull, l);
        }
        this.frame.endScope(this.chunk, l);
        break;
      }

      case "StructInitExpr": {
        for (const field of expr.fields) {
          this.emitConst(field.key, l);
          this.compileExpr(field.value);
        }
        // Include the struct name as a "__type__" field directly in the object
        // literal, rather than tagging afterward (which required a stack layout
        // SET_FIELD does not expect).
        this.emitConst("__type__", l);
        this.emitConst(expr.name, l);
        this.emitU16(Op.MakeObject, expr.fields.length + 1, l);
        break;
      }

      case "RangeExpr":
        this.compileExpr(expr.start);
        this.compileExpr(expr.end);
        if (expr.inclusive) {
          // range(start, end + 1) for inclusive
          this.emitConst(1, l);
          this.emit(Op.Add, l);
        }
        // Call built-in range function
        const rangeIdx = this.nameConst("range");
        this.emitU16(Op.LoadGlobal, rangeIdx, l);
        this.emit(Op.Call, l);
        this.chunk.writeByte(2, l);
        break;

      case "CastExpr":
        // Runtime cast — emit a type conversion call
        this.compileExpr(expr.expr);
        break;

      case "MatchExpr":
        this.compileMatchExpr(expr);
        break;

      case "AwaitExpr": {
        const unwrapIdx = this.nameConst("__hkd_unwrap");
        this.emitU16(Op.LoadGlobal, unwrapIdx, l);
        this.compileExpr(expr.expr);
        this.emit(Op.Call, l);
        this.chunk.writeByte(1, l);
        break;
      }
    }
  }

  private compileIdentLoad(name: string, line: number): void {
    const slot = this.frame.resolveLocal(name);
    if (slot >= 0) {
      this.emitU16(Op.LoadLocal, slot, line);
      return;
    }

    // Check enclosing frames for upvalues
    for (let i = this.frames.length - 2; i >= 0; i--) {
      const enclosing = this.frames[i];
      const s = enclosing.resolveLocal(name);
      if (s >= 0) {
        const uvIdx = this.frame.addUpvalue(true, s);
        this.emitU16(Op.LoadUpvalue, uvIdx, line);
        return;
      }
    }

    // Global
    this.emitU16(Op.LoadGlobal, this.nameConst(name), line);
  }

  private compileBinary(expr: N.BinaryExpr): void {
    const l = this.line(expr);

    // Short-circuit && and ||
    if (expr.op === "&&") {
      this.compileExpr(expr.left);
      const jump = this.emitJump(Op.JumpFalse, l);
      this.emit(Op.Pop, l);
      this.compileExpr(expr.right);
      this.patchJump(jump);
      return;
    }
    if (expr.op === "||") {
      this.compileExpr(expr.left);
      const jump = this.emitJump(Op.JumpTrue, l);
      this.emit(Op.Pop, l);
      this.compileExpr(expr.right);
      this.patchJump(jump);
      return;
    }

    this.compileExpr(expr.left);
    this.compileExpr(expr.right);

    const opMap: Record<string, Op> = {
      "+":  Op.Add,  "-":  Op.Sub, "*":  Op.Mul, "/":  Op.Div,
      "%":  Op.Mod,  "**": Op.Pow,
      "==": Op.Eq,   "!=": Op.Ne,
      "<":  Op.Lt,   "<=": Op.Le,  ">":  Op.Gt,  ">=": Op.Ge,
      "&":  Op.BitAnd, "|": Op.BitOr, "^": Op.BitXor,
      "<<": Op.Shl, ">>": Op.Shr,
    };

    const op = opMap[expr.op];
    if (op !== undefined) {
      this.emit(op, l);
    }
  }

  private compileUnary(expr: N.UnaryExpr): void {
    const l = this.line(expr);
    this.compileExpr(expr.operand);
    switch (expr.op) {
      case "-": this.emit(Op.Neg, l); break;
      case "!": this.emit(Op.Not, l); break;
      case "~": this.emit(Op.BitNot, l); break;
    }
  }

  private compileCall(expr: N.CallExpr): void {
    const l = this.line(expr);

    // Monomorphic generic function call specialization: fn<T: Trait>(val: Struct) => fn__Struct(val)
    const monoName = (expr as any).monomorphizedName;
    if (monoName && expr.callee.kind === "IdentExpr") {
      if (!this.compiledSpecializations.has(monoName)) {
        this.compiledSpecializations.add(monoName);
        const origFunc = this.genericFunctions.get(expr.callee.name);
        if (origFunc) {
          const parts = monoName.split("__");
          const structName = parts.slice(1).join("__");
          const prevSpec = this.currentSpecializedReceiverStruct;
          this.currentSpecializedReceiverStruct = structName;
          const effectiveFunc = origFunc.isAsync ? desugarAsyncFunction(origFunc) : origFunc;
          const { fn, upvalues } = this.compileFunction(
            monoName,
            effectiveFunc.params,
            effectiveFunc.body,
            l
          );
          this.currentSpecializedReceiverStruct = prevSpec;
          this.emitClosure(fn, upvalues, l);
          this.declareVariable(monoName, l, false);
        }
      }
      this.compileIdentLoad(monoName, l);
      for (const arg of expr.args) this.compileExpr(arg);
      this.emit(Op.Call, l);
      this.chunk.writeByte(expr.args.length, l);
      return;
    }

    // Monomorphic struct method lowering: receiver.method(args...) => Struct__method(receiver, args...)
    if (expr.callee.kind === "MemberExpr") {
      let structName: string | null = null;
      const receiver = expr.callee.object;
      const receiverType = (receiver as any).inferredType;

      if (receiverType && receiverType.kind === "Struct") {
        structName = receiverType.name;
      } else if ((expr.callee as any).structName) {
        structName = (expr.callee as any).structName;
      } else if (receiver.kind === "IdentExpr" && receiver.name === "self" && this.currentStruct) {
        structName = this.currentStruct;
      } else if (receiver.kind === "StructInitExpr") {
        structName = receiver.name;
      } else if (this.currentSpecializedReceiverStruct) {
        structName = this.currentSpecializedReceiverStruct;
      } else if (this.methodToStruct.has(expr.callee.property)) {
        const candidates = this.methodToStruct.get(expr.callee.property)!;
        if (candidates.size === 1) {
          structName = Array.from(candidates)[0];
        }
      }

      if (structName) {
        const mangledName = `${structName}__${expr.callee.property}`;
        // Push lowered function callee
        this.compileIdentLoad(mangledName, l);
        // Push receiver (self)
        this.compileExpr(receiver);
        // Push method arguments
        for (const arg of expr.args) this.compileExpr(arg);
        // Emit call with argc = args.length + 1
        this.emit(Op.Call, l);
        this.chunk.writeByte(expr.args.length + 1, l);
        return;
      }
    }

    // Normal function call
    // Push callee
    this.compileExpr(expr.callee);

    // Push arguments
    for (const arg of expr.args) this.compileExpr(arg);

    this.emit(Op.Call, l);
    this.chunk.writeByte(expr.args.length, l);
  }

  private compileAssign(expr: N.AssignExpr): void {
    const l = this.line(expr);
    this.compileExpr(expr.value);
    // StoreLocal/StoreGlobal/SetIndex/SetField all keep the assigned value on
    // the stack (they store from peek, not pop), so the assignment expression
    // naturally leaves exactly one value. No DUP is needed.

    if (expr.target.kind === "IdentExpr") {
      const slot = this.frame.resolveLocal(expr.target.name);
      if (slot >= 0) {
        this.emitU16(Op.StoreLocal, slot, l);
      } else {
        let foundUpvalue = false;
        for (let i = this.frames.length - 2; i >= 0; i--) {
          const enclosing = this.frames[i];
          const s = enclosing.resolveLocal(expr.target.name);
          if (s >= 0) {
            const uvIdx = this.frame.addUpvalue(true, s);
            this.emitU16(Op.StoreUpvalue, uvIdx, l);
            foundUpvalue = true;
            break;
          }
        }
        if (!foundUpvalue) {
          this.emitU16(Op.StoreGlobal, this.nameConst(expr.target.name), l);
        }
      }
    } else if (expr.target.kind === "IndexExpr") {
      // arr[idx] = val: val on stack, then arr, then idx
      this.compileExpr(expr.target.object);
      this.compileExpr(expr.target.index);
      this.emit(Op.SetIndex, l);
    } else if (expr.target.kind === "MemberExpr") {
      this.compileExpr(expr.target.object);
      this.emitU16(Op.SetField, this.nameConst(expr.target.property), l);
    }
  }

  private compileCompoundAssign(expr: N.CompoundAssignExpr): void {
    const l = this.line(expr);
    // Load current value
    this.compileExpr(expr.target);
    // Load RHS
    this.compileExpr(expr.value);

    const opMap: Record<string, Op> = {
      "+=": Op.Add, "-=": Op.Sub, "*=": Op.Mul, "/=": Op.Div, "%=": Op.Mod,
    };
    this.emit(opMap[expr.op], l);

    if (expr.target.kind === "IdentExpr") {
      const slot = this.frame.resolveLocal(expr.target.name);
      if (slot >= 0) {
        this.emitU16(Op.StoreLocal, slot, l);
      } else {
        let foundUpvalue = false;
        for (let i = this.frames.length - 2; i >= 0; i--) {
          const enclosing = this.frames[i];
          const s = enclosing.resolveLocal(expr.target.name);
          if (s >= 0) {
            const uvIdx = this.frame.addUpvalue(true, s);
            this.emitU16(Op.StoreUpvalue, uvIdx, l);
            foundUpvalue = true;
            break;
          }
        }
        if (!foundUpvalue) {
          this.emitU16(Op.StoreGlobal, this.nameConst(expr.target.name), l);
        }
      }
    }
  }

  private compileIfExpr(expr: N.IfExpr): void {
    const l = this.line(expr);
    this.compileExpr(expr.condition);
    const elseJump = this.emitJump(Op.JumpFalse, l);
    this.emit(Op.Pop, l);

    // Then branch
    this.frame.beginScope();
    for (const s of expr.then.body) this.compileStmt(s);
    this.frame.endScope(this.chunk, l);
    this.emit(Op.LoadNull, l); // if no explicit value

    if (expr.else_) {
      const endJump = this.emitJump(Op.Jump, l);
      this.patchJump(elseJump);
      this.emit(Op.Pop, l);

      if (expr.else_.kind === "BlockStmt") {
        this.frame.beginScope();
        for (const s of expr.else_.body) this.compileStmt(s);
        this.frame.endScope(this.chunk, l);
        this.emit(Op.LoadNull, l);
      } else {
        this.compileIfExpr(expr.else_);
      }
      this.patchJump(endJump);
    } else {
      this.patchJump(elseJump);
      this.emit(Op.Pop, l);
      this.emit(Op.LoadNull, l);
    }
  }

  private compileMatchExpr(expr: N.MatchExpr): void {
    const l = this.line(expr);
    // 1. Evaluate scrutinee and assign to local
    this.compileExpr(expr.scrutinee);
    const slot = this.frame.defineLocal(`__match_${this.chunk.code.length}`);
    this.emitU16(Op.StoreLocal, slot, l);

    const endJumps: number[] = [];

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i];
      const patternFailJumps: number[] = [];

      // Test pattern condition
      this.compilePatternCondition(arm.pattern, slot, patternFailJumps, l);

      // Pattern matched: bind pattern identifiers so guard (and body) can use them
      const boundCount = this.bindPatternIdentifiers(arm.pattern, slot, l);

      // Test guard if present
      let guardFailJump = -1;
      if (arm.guard) {
        this.compileExpr(arm.guard);
        guardFailJump = this.emitJump(Op.JumpFalse, l);
        this.emit(Op.Pop, l); // pop truthy guard
      }

      // Evaluate arm body
      if (arm.body.kind === "BlockStmt") {
        const stmts = arm.body.body;
        for (let j = 0; j < stmts.length - 1; j++) {
          this.compileStmt(stmts[j]);
        }
        const last = stmts[stmts.length - 1];
        if (last) {
          if (last.kind === "ExprStmt") {
            this.compileExpr(last.expr);
          } else {
            this.compileStmt(last);
            this.emit(Op.LoadNull, l);
          }
        } else {
          this.emit(Op.LoadNull, l);
        }
      } else {
        this.compileExpr(arm.body);
      }

      // Store arm result into scrutinee slot
      this.emitU16(Op.StoreLocal, slot, l);
      this.emit(Op.Pop, l); // pop arm result

      // Clean up bound identifiers from the stack (success path)
      for (let k = 0; k < boundCount; k++) {
        this.frame.discardLocal();
        this.emit(Op.Pop, l);
      }

      // Jump to end of match
      endJumps.push(this.emitJump(Op.Jump, l));

      // Guard failure path:
      let afterGuardJump = -1;
      if (guardFailJump !== -1) {
        this.patchJump(guardFailJump);
        this.emit(Op.Pop, l); // pop falsy guard
        // pop bound locals on stack
        for (let k = 0; k < boundCount; k++) {
          this.emit(Op.Pop, l);
        }
        if (patternFailJumps.length > 0) {
          afterGuardJump = this.emitJump(Op.Jump, l);
        }
      }

      // Pattern failure jumps:
      for (const jmp of patternFailJumps) {
        this.patchJump(jmp);
        this.emit(Op.Pop, l); // pop falsy pattern condition
      }

      if (afterGuardJump !== -1) {
        this.patchJump(afterGuardJump);
      }
    }

    // Default if no arms matched: null
    this.emit(Op.LoadNull, l);
    this.emitU16(Op.StoreLocal, slot, l);
    this.emit(Op.Pop, l);

    // Patch all end jumps
    for (const jmp of endJumps) {
      this.patchJump(jmp);
    }

    // Discard scrutinee/result slot so endScope doesn't pop it
    this.frame.discardLocal();
  }

  private compilePatternCondition(
    pat: N.Pattern,
    scrutineeSlot: number,
    failJumps: number[],
    line: number
  ): void {
    switch (pat.kind) {
      case "WildcardPattern":
      case "IdentPattern":
        break; // unconditionally matches

      case "LiteralPattern": {
        this.emitU16(Op.LoadLocal, scrutineeSlot, line);
        this.compileExpr(pat.literal);
        this.emit(Op.Eq, line);
        const jmp = this.emitJump(Op.JumpFalse, line);
        this.emit(Op.Pop, line); // pop true comparison
        failJumps.push(jmp);
        break;
      }

      case "ArrayPattern": {
        // 1. Check array length
        this.emitU16(Op.LoadLocal, scrutineeSlot, line);
        this.emit(Op.ArrayLen, line);
        this.emitConst(pat.elements.length, line);
        this.emit(Op.Eq, line);
        const lenJmp = this.emitJump(Op.JumpFalse, line);
        this.emit(Op.Pop, line); // pop true comparison
        failJumps.push(lenJmp);

        // 2. Check literal elements if any
        for (let i = 0; i < pat.elements.length; i++) {
          const elem = pat.elements[i];
          if (elem.kind === "LiteralPattern") {
            this.emitU16(Op.LoadLocal, scrutineeSlot, line);
            this.emitConst(i, line);
            this.emit(Op.GetIndex, line);
            this.compileExpr(elem.literal);
            this.emit(Op.Eq, line);
            const jmp = this.emitJump(Op.JumpFalse, line);
            this.emit(Op.Pop, line);
            failJumps.push(jmp);
          }
        }
        break;
      }
    }
  }

  private bindPatternIdentifiers(
    pat: N.Pattern,
    scrutineeSlot: number,
    line: number
  ): number {
    let count = 0;
    switch (pat.kind) {
      case "WildcardPattern":
      case "LiteralPattern":
        break;

      case "IdentPattern": {
        const idSlot = this.frame.defineLocal(pat.name);
        this.emitU16(Op.LoadLocal, scrutineeSlot, line);
        this.emitU16(Op.StoreLocal, idSlot, line);
        count++;
        break;
      }

      case "ArrayPattern": {
        for (let i = 0; i < pat.elements.length; i++) {
          const elem = pat.elements[i];
          if (elem.kind === "IdentPattern") {
            const idSlot = this.frame.defineLocal(elem.name);
            this.emitU16(Op.LoadLocal, scrutineeSlot, line);
            this.emitConst(i, line);
            this.emit(Op.GetIndex, line);
            this.emitU16(Op.StoreLocal, idSlot, line);
            count++;
          }
        }
        break;
      }
    }
    return count;
  }

  // ── Variable declaration helper ───────────────────────────────────────────

  private declareVariable(name: string, line: number, _mutable: boolean): void {
    if (this.frame.scopeDepth > 0 || this.frames.length > 1) {
      // Local
      const slot = this.frame.defineLocal(name);
      this.emitU16(Op.StoreLocal, slot, line);
    } else {
      // Global
      this.emitU16(Op.DefineGlobal, this.nameConst(name), line);
    }
  }
}

// ─── Convenience function ─────────────────────────────────────────────────────

export function compile(
  program: N.Program,
  reporter?: ErrorReporter
): Chunk {
  const rep = reporter ?? new ErrorReporter("", program.fileName);
  const compiler = new Compiler(rep);
  return compiler.compile(program);
}
