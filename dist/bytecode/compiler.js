"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Compiler = void 0;
exports.compile = compile;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const chunk_js_1 = require("./chunk.js");
const index_js_1 = require("../errors/index.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const async_lowering_js_1 = require("./async_lowering.js");
const optimizer_js_1 = require("./optimizer.js");
// ─── Compiler frame (one per function) ───────────────────────────────────────
class CompilerFrame {
    chunk;
    locals = [];
    scopeDepth = 0;
    loops = [];
    upvalues = [];
    constructor(name, arity) {
        this.chunk = new chunk_js_1.Chunk(name, arity);
    }
    defineLocal(name) {
        const slot = this.locals.length;
        this.locals.push({ name, depth: this.scopeDepth, captured: false });
        this.chunk.localCount = Math.max(this.chunk.localCount, this.locals.length);
        return slot;
    }
    resolveLocal(name) {
        for (let i = this.locals.length - 1; i >= 0; i--) {
            if (this.locals[i].name === name)
                return i;
        }
        return -1;
    }
    addUpvalue(isLocal, index) {
        for (let i = 0; i < this.upvalues.length; i++) {
            const uv = this.upvalues[i];
            if (uv.isLocal === isLocal && uv.index === index)
                return i;
        }
        this.upvalues.push({ isLocal, index });
        this.chunk.upvalueCount = this.upvalues.length;
        return this.upvalues.length - 1;
    }
    beginScope() { this.scopeDepth++; }
    /**
     * Remove the most recently defined local from bookkeeping without emitting
     * any code. Used when the caller has already emitted the pop for a local that
     * must not also be freed by endScope (e.g. the loop variable in a for loop).
     */
    discardLocal() {
        if (this.locals.length > 0)
            this.locals.pop();
    }
    endScope(chunk, line) {
        this.scopeDepth--;
        // Pop all locals defined in this scope
        while (this.locals.length > 0 &&
            this.locals[this.locals.length - 1].depth > this.scopeDepth) {
            const local = this.locals.pop();
            if (local.captured) {
                chunk.writeByte(24 /* Op.CloseUpvalue */, line);
            }
            else {
                chunk.writeByte(5 /* Op.Pop */, line);
            }
        }
    }
    pushLoop(start) {
        this.loops.push({ start, breakPatches: [] });
    }
    popLoop(chunk) {
        const loop = this.loops.pop();
        for (const patch of loop.breakPatches) {
            chunk.patchJump(patch);
        }
    }
    currentLoop() {
        return this.loops[this.loops.length - 1] ?? null;
    }
}
// ─── Compiler ─────────────────────────────────────────────────────────────────
class Compiler {
    frames = [];
    reporter;
    isModule;
    methodToStruct = new Map();
    genericFunctions = new Map();
    compiledSpecializations = new Set();
    currentSpecializedReceiverStruct = null;
    currentStruct = null;
    loadedImportPaths = new Set();
    optimizer;
    constructor(reporter, isModule = false, optimizerOptions) {
        this.reporter = reporter;
        this.isModule = isModule;
        this.optimizer = new optimizer_js_1.OptimizerPipeline(optimizerOptions);
    }
    getOptimizer() {
        return this.optimizer;
    }
    loadImportedAst(sourcePath) {
        try {
            const currentFile = this.reporter.fileName;
            const baseDir = currentFile ? path.dirname(currentFile) : process.cwd();
            let resolved = path.resolve(baseDir, sourcePath);
            if (!fs.existsSync(resolved) && !resolved.endsWith(".hkd")) {
                resolved = resolved + ".hkd";
            }
            if (!fs.existsSync(resolved) || this.loadedImportPaths.has(resolved))
                return null;
            this.loadedImportPaths.add(resolved);
            const fileContent = fs.readFileSync(resolved, "utf-8");
            const subReporter = new index_js_1.ErrorReporter(fileContent, resolved);
            const lexer = new lexer_js_1.Lexer(fileContent, resolved, subReporter);
            const tokens = lexer.tokenize();
            const parser = new parser_js_1.Parser(tokens, fileContent, resolved, subReporter, "2027");
            return parser.parse();
        }
        catch {
            return null;
        }
    }
    scanImportedAst(sourcePath, currentDir) {
        const defaultBase = this.reporter.fileName ? path.dirname(this.reporter.fileName) : process.cwd();
        const baseDir = currentDir ?? defaultBase;
        let resolved = path.resolve(baseDir, sourcePath);
        if (!fs.existsSync(resolved) && !resolved.endsWith(".hkd")) {
            resolved = resolved + ".hkd";
        }
        if (!fs.existsSync(resolved) || this.loadedImportPaths.has(resolved))
            return;
        this.loadedImportPaths.add(resolved);
        let ast;
        try {
            const fileContent = fs.readFileSync(resolved, "utf-8");
            const subReporter = new index_js_1.ErrorReporter(fileContent, resolved);
            const lexer = new lexer_js_1.Lexer(fileContent, resolved, subReporter);
            const tokens = lexer.tokenize();
            const parser = new parser_js_1.Parser(tokens, fileContent, resolved, subReporter, "2027");
            ast = parser.parse();
        }
        catch {
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
                    this.methodToStruct.get(m.name).add(decl.structName);
                }
            }
            else if (decl.kind === "FunctionDeclStmt") {
                if (decl.typeParams && decl.typeParams.length > 0) {
                    this.genericFunctions.set(decl.name, decl);
                }
            }
        }
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    compile(program) {
        const optProgram = this.optimizer.optimizeAst(program);
        // Pre-scan impl blocks for method resolution and generic functions
        for (const stmt of optProgram.statements) {
            if (stmt.kind === "ImportStmt") {
                this.scanImportedAst(stmt.source);
            }
            const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
            if (decl.kind === "ImplBlockStmt") {
                for (const m of decl.methods) {
                    if (!this.methodToStruct.has(m.name)) {
                        this.methodToStruct.set(m.name, new Set());
                    }
                    this.methodToStruct.get(m.name).add(decl.structName);
                }
            }
            else if (decl.kind === "FunctionDeclStmt") {
                if (decl.typeParams && decl.typeParams.length > 0) {
                    this.genericFunctions.set(decl.name, decl);
                }
            }
        }
        const frame = new CompilerFrame("<script>", 0);
        this.frames.push(frame);
        for (const stmt of optProgram.statements) {
            this.compileStmt(stmt);
        }
        this.emit(255 /* Op.Halt */, 0);
        const result = this.optimizer.optimizeChunk(frame.chunk);
        this.frames.pop();
        return result;
    }
    // ── Frame helpers ──────────────────────────────────────────────────────────
    get frame() {
        return this.frames[this.frames.length - 1];
    }
    get chunk() {
        return this.frame.chunk;
    }
    emit(op, line) {
        this.chunk.writeByte(op, line);
    }
    emitU16(op, operand, line) {
        this.chunk.writeOpU16(op, operand, line);
    }
    emitConst(value, line) {
        this.chunk.emitConstant(value, line);
    }
    emitJump(op, line) {
        return this.chunk.emitJump(op, line);
    }
    patchJump(offset) {
        this.chunk.patchJump(offset);
    }
    line(node) {
        return node.span.start.line;
    }
    // ── Name constant helpers ─────────────────────────────────────────────────
    nameConst(name) {
        return this.chunk.addConstant(name);
    }
    // ── Statement compilation ─────────────────────────────────────────────────
    compileStmt(stmt) {
        switch (stmt.kind) {
            case "VarDeclStmt":
                this.compileVarDecl(stmt);
                break;
            case "ConstDeclStmt":
                this.compileConstDecl(stmt);
                break;
            case "FunctionDeclStmt":
                this.compileFunctionDecl(stmt);
                break;
            case "StructDeclStmt":
                this.compileStructDecl(stmt);
                break;
            case "ImplBlockStmt":
                this.compileImplBlock(stmt);
                break;
            case "TraitDeclStmt": break; // compile-time only
            case "TypeAliasStmt": break; // compile-time only
            case "ReturnStmt":
                this.compileReturn(stmt);
                break;
            case "BreakStmt":
                this.compileBreak(stmt);
                break;
            case "ContinueStmt":
                this.compileContinue(stmt);
                break;
            case "IfStmt":
                this.compileIfStmt(stmt);
                break;
            case "WhileStmt":
                this.compileWhile(stmt);
                break;
            case "ForStmt":
                this.compileFor(stmt);
                break;
            case "BlockStmt":
                this.compileBlock(stmt);
                break;
            case "ExprStmt":
                this.compileExprStmt(stmt);
                break;
            case "ImportStmt":
                this.compileImport(stmt);
                break;
            case "ExportStmt":
                this.compileStmt(stmt.declaration);
                break;
            case "TestStmt":
                this.compileTest(stmt);
                break;
            case "AssertStmt":
                this.compileAssert(stmt);
                break;
        }
    }
    compileVarDecl(stmt) {
        const l = this.line(stmt);
        if (stmt.initializer) {
            this.compileExpr(stmt.initializer);
        }
        else {
            this.emit(2 /* Op.LoadNull */, l);
        }
        this.declareVariable(stmt.name, l, true);
    }
    compileConstDecl(stmt) {
        const l = this.line(stmt);
        this.compileExpr(stmt.initializer);
        this.declareVariable(stmt.name, l, false);
    }
    compileFunctionDecl(stmt) {
        if (stmt.isAsync) {
            const lowered = (0, async_lowering_js_1.desugarAsyncFunction)(stmt);
            this.compileFunctionDecl(lowered);
            return;
        }
        const l = this.line(stmt);
        const { fn, upvalues } = this.compileFunction(stmt.name, stmt.params, stmt.body, l);
        this.emitClosure(fn, upvalues, l);
        this.declareVariable(stmt.name, l, false);
    }
    compileFunction(name, params, body, line) {
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
        this.emit(2 /* Op.LoadNull */, line);
        this.emit(97 /* Op.Return */, line);
        const chunk = childFrame.chunk;
        const upvalues = childFrame.upvalues;
        this.frames.pop();
        const fn = {
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
    emitClosure(fn, upvalues, line) {
        if (upvalues.length === 0) {
            this.emitConst(fn, line);
            return;
        }
        const fnIdx = this.chunk.addConstant(fn);
        this.chunk.writeOpU16(98 /* Op.MakeClosure */, fnIdx, line);
        this.chunk.writeByte(upvalues.length, line);
        for (const uv of upvalues) {
            this.chunk.writeByte(uv.isLocal ? 1 : 0, line);
            this.chunk.writeU16(uv.index, line);
        }
    }
    compileStructDecl(_stmt) {
        // Structs are defined as runtime constructors
        // The VM will create instances via MAKE_OBJECT
        // TODO: Proper struct runtime representation
    }
    compileImplBlock(stmt) {
        const l = this.line(stmt);
        const prevStruct = this.currentStruct;
        this.currentStruct = stmt.structName;
        for (const method of stmt.methods) {
            const effectiveMethod = method.isAsync ? (0, async_lowering_js_1.desugarAsyncFunction)(method) : method;
            const mangledName = `${stmt.structName}__${effectiveMethod.name}`;
            const { fn, upvalues } = this.compileFunction(mangledName, effectiveMethod.params, effectiveMethod.body, l);
            this.emitClosure(fn, upvalues, l);
            this.declareVariable(mangledName, l, false);
        }
        this.currentStruct = prevStruct;
    }
    compileReturn(stmt) {
        const l = this.line(stmt);
        if (stmt.value) {
            this.compileExpr(stmt.value);
        }
        else {
            this.emit(2 /* Op.LoadNull */, l);
        }
        this.emit(97 /* Op.Return */, l);
    }
    compileBreak(stmt) {
        const l = this.line(stmt);
        const loop = this.frame.currentLoop();
        if (!loop) {
            this.reporter.error(index_js_1.ErrorCode.E306, "`break` outside loop", stmt.span);
            return;
        }
        // Close any locals that are in scope
        const patch = this.emitJump(80 /* Op.Jump */, l);
        loop.breakPatches.push(patch);
    }
    compileContinue(stmt) {
        const l = this.line(stmt);
        const loop = this.frame.currentLoop();
        if (!loop) {
            this.reporter.error(index_js_1.ErrorCode.E306, "`continue` outside loop", stmt.span);
            return;
        }
        // Jump back to loop start
        this.chunk.emitLoop(loop.start, l);
    }
    compileIfStmt(stmt) {
        const l = this.line(stmt);
        this.compileExpr(stmt.condition);
        const elseJump = this.emitJump(81 /* Op.JumpFalse */, l);
        this.emit(5 /* Op.Pop */, l); // pop condition
        this.compileBlock(stmt.then);
        if (stmt.else_) {
            const endJump = this.emitJump(80 /* Op.Jump */, l);
            this.patchJump(elseJump);
            this.emit(5 /* Op.Pop */, l); // pop condition on else path
            if (stmt.else_.kind === "IfStmt") {
                this.compileIfStmt(stmt.else_);
            }
            else {
                this.compileBlock(stmt.else_);
            }
            this.patchJump(endJump);
        }
        else {
            const endJump = this.emitJump(80 /* Op.Jump */, l);
            this.patchJump(elseJump);
            this.emit(5 /* Op.Pop */, l); // pop condition
            this.patchJump(endJump);
        }
    }
    compileWhile(stmt) {
        const l = this.line(stmt);
        const loopStart = this.chunk.code.length;
        this.frame.pushLoop(loopStart);
        this.compileExpr(stmt.condition);
        const exitJump = this.emitJump(81 /* Op.JumpFalse */, l);
        this.emit(5 /* Op.Pop */, l); // pop condition
        this.frame.beginScope();
        for (const s of stmt.body.body)
            this.compileStmt(s);
        this.frame.endScope(this.chunk, l);
        this.chunk.emitLoop(loopStart, l);
        this.patchJump(exitJump);
        this.emit(5 /* Op.Pop */, l); // pop condition on exit
        this.frame.popLoop(this.chunk);
    }
    compileFor(stmt) {
        const l = this.line(stmt);
        // Enter the loop-variable scope and CLAIM its stack slot with a placeholder.
        // The iterator is created AFTER this placeholder so it sits ABOVE the local
        // slot. Otherwise STORE_LOCAL would write into the same stack cell the
        // iterator occupies (they both start at slot 0 at top-level), overwriting it.
        this.frame.beginScope();
        const slot = this.frame.defineLocal(stmt.variable);
        this.emit(2 /* Op.LoadNull */, l);
        // Evaluate iterable and make iterator
        this.compileExpr(stmt.iterable);
        this.emit(144 /* Op.MakeIter */, l);
        this.frame.defineLocal("$iter");
        const loopStart = this.chunk.code.length;
        this.frame.pushLoop(loopStart);
        // IterNext: advance; if done jump to end
        const exitJump = this.chunk.emitJump(145 /* Op.IterNext */, l);
        // Define loop variable: store the value yielded onto the stack by ITER_NEXT
        // into the reserved local slot, then drop the stray copy on top
        this.emitU16(17 /* Op.StoreLocal */, slot, l);
        this.emit(5 /* Op.Pop */, l);
        this.frame.beginScope();
        for (const s of stmt.body.body)
            this.compileStmt(s);
        this.frame.endScope(this.chunk, l);
        this.chunk.emitLoop(loopStart, l);
        this.patchJump(exitJump);
        // On a normal (done) exit ITER_NEXT already popped the iterator, so the
        // loop-variable value is now on top of the stack — pop it here.
        this.emit(5 /* Op.Pop */, l);
        this.frame.discardLocal();
        this.frame.discardLocal();
        this.frame.endScope(this.chunk, l);
        this.frame.popLoop(this.chunk);
    }
    compileBlock(block) {
        const l = this.line(block);
        this.frame.beginScope();
        for (const stmt of block.body)
            this.compileStmt(stmt);
        this.frame.endScope(this.chunk, l);
    }
    compileExprStmt(stmt) {
        this.compileExpr(stmt.expr);
        // Pop result of expression statements (unless void call)
        this.emit(5 /* Op.Pop */, this.line(stmt));
    }
    compileImport(stmt) {
        const l = this.line(stmt);
        // The VM's CALL convention is [callee, arg1, ... argN], so push the callee
        // (__import__) first, then the module-path argument.
        const nameIdx = this.nameConst("__import__");
        this.emitU16(19 /* Op.LoadGlobal */, nameIdx, l);
        this.emitConst(stmt.source, l);
        this.emit(96 /* Op.Call */, l);
        this.chunk.writeByte(1, l); // argc = 1
        if (stmt.specifiers && stmt.specifiers.length > 0) {
            for (let i = 0; i < stmt.specifiers.length; i++) {
                const spec = stmt.specifiers[i];
                const isLast = i === stmt.specifiers.length - 1 && !stmt.defaultName;
                if (!isLast) {
                    this.emit(6 /* Op.Dup */, l);
                }
                this.emitU16(129 /* Op.GetField */, this.nameConst(spec.name), l);
                this.declareVariable(spec.alias ?? spec.name, l, false);
            }
        }
        if (stmt.defaultName) {
            this.declareVariable(stmt.defaultName, l, false);
        }
        else if (!stmt.specifiers || stmt.specifiers.length === 0) {
            this.emit(5 /* Op.Pop */, l);
        }
    }
    compileTest(stmt) {
        // Test blocks compile to function bodies registered with the test runner
        const l = this.line(stmt);
        const registerIdx = this.nameConst("__register_test__");
        this.emitU16(19 /* Op.LoadGlobal */, registerIdx, l);
        const { fn, upvalues } = this.compileFunction(`test:${stmt.description}`, [], stmt.body, l);
        this.emitClosure(fn, upvalues, l);
        this.emitConst(stmt.description, l);
        this.emit(96 /* Op.Call */, l);
        this.chunk.writeByte(2, l);
        this.emit(5 /* Op.Pop */, l);
    }
    compileAssert(stmt) {
        const l = this.line(stmt);
        const assertIdx = this.nameConst("__assert__");
        this.emitU16(19 /* Op.LoadGlobal */, assertIdx, l);
        this.compileExpr(stmt.condition);
        if (stmt.message) {
            this.compileExpr(stmt.message);
        }
        else {
            this.emitConst("Assertion failed", l);
        }
        this.emit(96 /* Op.Call */, l);
        this.chunk.writeByte(2, l);
        this.emit(5 /* Op.Pop */, l);
    }
    // ── Expression compilation ────────────────────────────────────────────────
    compileExpr(expr) {
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
                this.emit(expr.value ? 3 /* Op.LoadTrue */ : 4 /* Op.LoadFalse */, l);
                break;
            case "NullLiteral":
                this.emit(2 /* Op.LoadNull */, l);
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
                this.emit(113 /* Op.GetIndex */, l);
                break;
            case "MemberExpr":
                this.compileExpr(expr.object);
                this.emitU16(129 /* Op.GetField */, this.nameConst(expr.property), l);
                break;
            case "AssignExpr":
                this.compileAssign(expr);
                break;
            case "CompoundAssignExpr":
                this.compileCompoundAssign(expr);
                break;
            case "ArrayExpr":
                for (const el of expr.elements)
                    this.compileExpr(el);
                this.emitU16(112 /* Op.MakeArray */, expr.elements.length, l);
                break;
            case "ObjectExpr":
                for (const field of expr.fields) {
                    this.emitConst(field.key, l);
                    this.compileExpr(field.value);
                }
                this.emitU16(128 /* Op.MakeObject */, expr.fields.length, l);
                break;
            case "FunctionExpr": {
                if (expr.isAsync) {
                    const lowered = (0, async_lowering_js_1.desugarAsyncFunctionExpr)(expr);
                    this.compileExpr(lowered);
                    break;
                }
                const { fn, upvalues } = this.compileFunction("<anonymous>", expr.params, expr.body, l);
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
                    }
                    else {
                        this.compileStmt(last);
                        this.emit(2 /* Op.LoadNull */, l);
                    }
                }
                else {
                    this.emit(2 /* Op.LoadNull */, l);
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
                this.emitU16(128 /* Op.MakeObject */, expr.fields.length + 1, l);
                break;
            }
            case "RangeExpr":
                this.compileExpr(expr.start);
                this.compileExpr(expr.end);
                if (expr.inclusive) {
                    // range(start, end + 1) for inclusive
                    this.emitConst(1, l);
                    this.emit(32 /* Op.Add */, l);
                }
                // Call built-in range function
                const rangeIdx = this.nameConst("range");
                this.emitU16(19 /* Op.LoadGlobal */, rangeIdx, l);
                this.emit(96 /* Op.Call */, l);
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
                this.emitU16(19 /* Op.LoadGlobal */, unwrapIdx, l);
                this.compileExpr(expr.expr);
                this.emit(96 /* Op.Call */, l);
                this.chunk.writeByte(1, l);
                break;
            }
        }
    }
    compileIdentLoad(name, line) {
        const slot = this.frame.resolveLocal(name);
        if (slot >= 0) {
            this.emitU16(16 /* Op.LoadLocal */, slot, line);
            return;
        }
        // Check enclosing frames for upvalues
        for (let i = this.frames.length - 2; i >= 0; i--) {
            const enclosing = this.frames[i];
            const s = enclosing.resolveLocal(name);
            if (s >= 0) {
                const uvIdx = this.frame.addUpvalue(true, s);
                this.emitU16(22 /* Op.LoadUpvalue */, uvIdx, line);
                return;
            }
        }
        // Global
        this.emitU16(19 /* Op.LoadGlobal */, this.nameConst(name), line);
    }
    compileBinary(expr) {
        const l = this.line(expr);
        // Short-circuit && and ||
        if (expr.op === "&&") {
            this.compileExpr(expr.left);
            const jump = this.emitJump(81 /* Op.JumpFalse */, l);
            this.emit(5 /* Op.Pop */, l);
            this.compileExpr(expr.right);
            this.patchJump(jump);
            return;
        }
        if (expr.op === "||") {
            this.compileExpr(expr.left);
            const jump = this.emitJump(82 /* Op.JumpTrue */, l);
            this.emit(5 /* Op.Pop */, l);
            this.compileExpr(expr.right);
            this.patchJump(jump);
            return;
        }
        this.compileExpr(expr.left);
        this.compileExpr(expr.right);
        const opMap = {
            "+": 32 /* Op.Add */, "-": 33 /* Op.Sub */, "*": 34 /* Op.Mul */, "/": 35 /* Op.Div */,
            "%": 36 /* Op.Mod */, "**": 37 /* Op.Pow */,
            "==": 48 /* Op.Eq */, "!=": 49 /* Op.Ne */,
            "<": 50 /* Op.Lt */, "<=": 51 /* Op.Le */, ">": 52 /* Op.Gt */, ">=": 53 /* Op.Ge */,
            "&": 65 /* Op.BitAnd */, "|": 66 /* Op.BitOr */, "^": 67 /* Op.BitXor */,
            "<<": 69 /* Op.Shl */, ">>": 70 /* Op.Shr */,
        };
        const op = opMap[expr.op];
        if (op !== undefined) {
            this.emit(op, l);
        }
    }
    compileUnary(expr) {
        const l = this.line(expr);
        this.compileExpr(expr.operand);
        switch (expr.op) {
            case "-":
                this.emit(38 /* Op.Neg */, l);
                break;
            case "!":
                this.emit(64 /* Op.Not */, l);
                break;
            case "~":
                this.emit(68 /* Op.BitNot */, l);
                break;
        }
    }
    compileCall(expr) {
        const l = this.line(expr);
        // Monomorphic generic function call specialization: fn<T: Trait>(val: Struct) => fn__Struct(val)
        const monoName = expr.monomorphizedName;
        if (monoName && expr.callee.kind === "IdentExpr") {
            if (!this.compiledSpecializations.has(monoName)) {
                this.compiledSpecializations.add(monoName);
                const origFunc = this.genericFunctions.get(expr.callee.name);
                if (origFunc) {
                    const parts = monoName.split("__");
                    const structName = parts.slice(1).join("__");
                    const prevSpec = this.currentSpecializedReceiverStruct;
                    this.currentSpecializedReceiverStruct = structName;
                    const effectiveFunc = origFunc.isAsync ? (0, async_lowering_js_1.desugarAsyncFunction)(origFunc) : origFunc;
                    const { fn, upvalues } = this.compileFunction(monoName, effectiveFunc.params, effectiveFunc.body, l);
                    this.currentSpecializedReceiverStruct = prevSpec;
                    this.emitClosure(fn, upvalues, l);
                    this.declareVariable(monoName, l, false);
                }
            }
            this.compileIdentLoad(monoName, l);
            for (const arg of expr.args)
                this.compileExpr(arg);
            this.emit(96 /* Op.Call */, l);
            this.chunk.writeByte(expr.args.length, l);
            return;
        }
        // Monomorphic struct method lowering: receiver.method(args...) => Struct__method(receiver, args...)
        if (expr.callee.kind === "MemberExpr") {
            let structName = null;
            const receiver = expr.callee.object;
            const receiverType = receiver.inferredType;
            if (receiverType && receiverType.kind === "Struct") {
                structName = receiverType.name;
            }
            else if (expr.callee.structName) {
                structName = expr.callee.structName;
            }
            else if (receiver.kind === "IdentExpr" && receiver.name === "self" && this.currentStruct) {
                structName = this.currentStruct;
            }
            else if (receiver.kind === "StructInitExpr") {
                structName = receiver.name;
            }
            else if (this.currentSpecializedReceiverStruct) {
                structName = this.currentSpecializedReceiverStruct;
            }
            else if (this.methodToStruct.has(expr.callee.property)) {
                const candidates = this.methodToStruct.get(expr.callee.property);
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
                for (const arg of expr.args)
                    this.compileExpr(arg);
                // Emit call with argc = args.length + 1
                this.emit(96 /* Op.Call */, l);
                this.chunk.writeByte(expr.args.length + 1, l);
                return;
            }
        }
        // Normal function call
        // Push callee
        this.compileExpr(expr.callee);
        // Push arguments
        for (const arg of expr.args)
            this.compileExpr(arg);
        this.emit(96 /* Op.Call */, l);
        this.chunk.writeByte(expr.args.length, l);
    }
    compileAssign(expr) {
        const l = this.line(expr);
        this.compileExpr(expr.value);
        // StoreLocal/StoreGlobal/SetIndex/SetField all keep the assigned value on
        // the stack (they store from peek, not pop), so the assignment expression
        // naturally leaves exactly one value. No DUP is needed.
        if (expr.target.kind === "IdentExpr") {
            const slot = this.frame.resolveLocal(expr.target.name);
            if (slot >= 0) {
                this.emitU16(17 /* Op.StoreLocal */, slot, l);
            }
            else {
                let foundUpvalue = false;
                for (let i = this.frames.length - 2; i >= 0; i--) {
                    const enclosing = this.frames[i];
                    const s = enclosing.resolveLocal(expr.target.name);
                    if (s >= 0) {
                        const uvIdx = this.frame.addUpvalue(true, s);
                        this.emitU16(23 /* Op.StoreUpvalue */, uvIdx, l);
                        foundUpvalue = true;
                        break;
                    }
                }
                if (!foundUpvalue) {
                    this.emitU16(20 /* Op.StoreGlobal */, this.nameConst(expr.target.name), l);
                }
            }
        }
        else if (expr.target.kind === "IndexExpr") {
            // arr[idx] = val: val on stack, then arr, then idx
            this.compileExpr(expr.target.object);
            this.compileExpr(expr.target.index);
            this.emit(114 /* Op.SetIndex */, l);
        }
        else if (expr.target.kind === "MemberExpr") {
            this.compileExpr(expr.target.object);
            this.emitU16(130 /* Op.SetField */, this.nameConst(expr.target.property), l);
        }
    }
    compileCompoundAssign(expr) {
        const l = this.line(expr);
        // Load current value
        this.compileExpr(expr.target);
        // Load RHS
        this.compileExpr(expr.value);
        const opMap = {
            "+=": 32 /* Op.Add */, "-=": 33 /* Op.Sub */, "*=": 34 /* Op.Mul */, "/=": 35 /* Op.Div */, "%=": 36 /* Op.Mod */,
        };
        this.emit(opMap[expr.op], l);
        if (expr.target.kind === "IdentExpr") {
            const slot = this.frame.resolveLocal(expr.target.name);
            if (slot >= 0) {
                this.emitU16(17 /* Op.StoreLocal */, slot, l);
            }
            else {
                let foundUpvalue = false;
                for (let i = this.frames.length - 2; i >= 0; i--) {
                    const enclosing = this.frames[i];
                    const s = enclosing.resolveLocal(expr.target.name);
                    if (s >= 0) {
                        const uvIdx = this.frame.addUpvalue(true, s);
                        this.emitU16(23 /* Op.StoreUpvalue */, uvIdx, l);
                        foundUpvalue = true;
                        break;
                    }
                }
                if (!foundUpvalue) {
                    this.emitU16(20 /* Op.StoreGlobal */, this.nameConst(expr.target.name), l);
                }
            }
        }
    }
    compileIfExpr(expr) {
        const l = this.line(expr);
        this.compileExpr(expr.condition);
        const elseJump = this.emitJump(81 /* Op.JumpFalse */, l);
        this.emit(5 /* Op.Pop */, l);
        // Then branch
        this.frame.beginScope();
        for (const s of expr.then.body)
            this.compileStmt(s);
        this.frame.endScope(this.chunk, l);
        this.emit(2 /* Op.LoadNull */, l); // if no explicit value
        if (expr.else_) {
            const endJump = this.emitJump(80 /* Op.Jump */, l);
            this.patchJump(elseJump);
            this.emit(5 /* Op.Pop */, l);
            if (expr.else_.kind === "BlockStmt") {
                this.frame.beginScope();
                for (const s of expr.else_.body)
                    this.compileStmt(s);
                this.frame.endScope(this.chunk, l);
                this.emit(2 /* Op.LoadNull */, l);
            }
            else {
                this.compileIfExpr(expr.else_);
            }
            this.patchJump(endJump);
        }
        else {
            this.patchJump(elseJump);
            this.emit(5 /* Op.Pop */, l);
            this.emit(2 /* Op.LoadNull */, l);
        }
    }
    compileMatchExpr(expr) {
        const l = this.line(expr);
        // 1. Evaluate scrutinee and assign to local
        this.compileExpr(expr.scrutinee);
        const slot = this.frame.defineLocal(`__match_${this.chunk.code.length}`);
        this.emitU16(17 /* Op.StoreLocal */, slot, l);
        const endJumps = [];
        for (let i = 0; i < expr.arms.length; i++) {
            const arm = expr.arms[i];
            const patternFailJumps = [];
            // Test pattern condition
            this.compilePatternCondition(arm.pattern, slot, patternFailJumps, l);
            // Pattern matched: bind pattern identifiers so guard (and body) can use them
            const boundCount = this.bindPatternIdentifiers(arm.pattern, slot, l);
            // Test guard if present
            let guardFailJump = -1;
            if (arm.guard) {
                this.compileExpr(arm.guard);
                guardFailJump = this.emitJump(81 /* Op.JumpFalse */, l);
                this.emit(5 /* Op.Pop */, l); // pop truthy guard
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
                    }
                    else {
                        this.compileStmt(last);
                        this.emit(2 /* Op.LoadNull */, l);
                    }
                }
                else {
                    this.emit(2 /* Op.LoadNull */, l);
                }
            }
            else {
                this.compileExpr(arm.body);
            }
            // Store arm result into scrutinee slot
            this.emitU16(17 /* Op.StoreLocal */, slot, l);
            this.emit(5 /* Op.Pop */, l); // pop arm result
            // Clean up bound identifiers from the stack (success path)
            for (let k = 0; k < boundCount; k++) {
                this.frame.discardLocal();
                this.emit(5 /* Op.Pop */, l);
            }
            // Jump to end of match
            endJumps.push(this.emitJump(80 /* Op.Jump */, l));
            // Guard failure path:
            let afterGuardJump = -1;
            if (guardFailJump !== -1) {
                this.patchJump(guardFailJump);
                this.emit(5 /* Op.Pop */, l); // pop falsy guard
                // pop bound locals on stack
                for (let k = 0; k < boundCount; k++) {
                    this.emit(5 /* Op.Pop */, l);
                }
                if (patternFailJumps.length > 0) {
                    afterGuardJump = this.emitJump(80 /* Op.Jump */, l);
                }
            }
            // Pattern failure jumps:
            for (const jmp of patternFailJumps) {
                this.patchJump(jmp);
                this.emit(5 /* Op.Pop */, l); // pop falsy pattern condition
            }
            if (afterGuardJump !== -1) {
                this.patchJump(afterGuardJump);
            }
        }
        // Default if no arms matched: null
        this.emit(2 /* Op.LoadNull */, l);
        this.emitU16(17 /* Op.StoreLocal */, slot, l);
        this.emit(5 /* Op.Pop */, l);
        // Patch all end jumps
        for (const jmp of endJumps) {
            this.patchJump(jmp);
        }
        // Discard scrutinee/result slot so endScope doesn't pop it
        this.frame.discardLocal();
    }
    compilePatternCondition(pat, scrutineeSlot, failJumps, line) {
        switch (pat.kind) {
            case "WildcardPattern":
            case "IdentPattern":
                break; // unconditionally matches
            case "LiteralPattern": {
                this.emitU16(16 /* Op.LoadLocal */, scrutineeSlot, line);
                this.compileExpr(pat.literal);
                this.emit(48 /* Op.Eq */, line);
                const jmp = this.emitJump(81 /* Op.JumpFalse */, line);
                this.emit(5 /* Op.Pop */, line); // pop true comparison
                failJumps.push(jmp);
                break;
            }
            case "ArrayPattern": {
                // 1. Check array length
                this.emitU16(16 /* Op.LoadLocal */, scrutineeSlot, line);
                this.emit(115 /* Op.ArrayLen */, line);
                this.emitConst(pat.elements.length, line);
                this.emit(48 /* Op.Eq */, line);
                const lenJmp = this.emitJump(81 /* Op.JumpFalse */, line);
                this.emit(5 /* Op.Pop */, line); // pop true comparison
                failJumps.push(lenJmp);
                // 2. Check literal elements if any
                for (let i = 0; i < pat.elements.length; i++) {
                    const elem = pat.elements[i];
                    if (elem.kind === "LiteralPattern") {
                        this.emitU16(16 /* Op.LoadLocal */, scrutineeSlot, line);
                        this.emitConst(i, line);
                        this.emit(113 /* Op.GetIndex */, line);
                        this.compileExpr(elem.literal);
                        this.emit(48 /* Op.Eq */, line);
                        const jmp = this.emitJump(81 /* Op.JumpFalse */, line);
                        this.emit(5 /* Op.Pop */, line);
                        failJumps.push(jmp);
                    }
                }
                break;
            }
        }
    }
    bindPatternIdentifiers(pat, scrutineeSlot, line) {
        let count = 0;
        switch (pat.kind) {
            case "WildcardPattern":
            case "LiteralPattern":
                break;
            case "IdentPattern": {
                const idSlot = this.frame.defineLocal(pat.name);
                this.emitU16(16 /* Op.LoadLocal */, scrutineeSlot, line);
                this.emitU16(17 /* Op.StoreLocal */, idSlot, line);
                count++;
                break;
            }
            case "ArrayPattern": {
                for (let i = 0; i < pat.elements.length; i++) {
                    const elem = pat.elements[i];
                    if (elem.kind === "IdentPattern") {
                        const idSlot = this.frame.defineLocal(elem.name);
                        this.emitU16(16 /* Op.LoadLocal */, scrutineeSlot, line);
                        this.emitConst(i, line);
                        this.emit(113 /* Op.GetIndex */, line);
                        this.emitU16(17 /* Op.StoreLocal */, idSlot, line);
                        count++;
                    }
                }
                break;
            }
        }
        return count;
    }
    // ── Variable declaration helper ───────────────────────────────────────────
    declareVariable(name, line, _mutable) {
        if (this.frame.scopeDepth > 0 || this.frames.length > 1) {
            // Local
            const slot = this.frame.defineLocal(name);
            this.emitU16(17 /* Op.StoreLocal */, slot, line);
        }
        else {
            // Global
            this.emitU16(21 /* Op.DefineGlobal */, this.nameConst(name), line);
        }
    }
}
exports.Compiler = Compiler;
// ─── Convenience function ─────────────────────────────────────────────────────
function compile(program, reporter) {
    const rep = reporter ?? new index_js_1.ErrorReporter("", program.fileName);
    const compiler = new Compiler(rep);
    return compiler.compile(program);
}
//# sourceMappingURL=compiler.js.map