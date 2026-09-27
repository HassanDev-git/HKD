"use strict";
/**
 * HKD Semantic Analyser
 *
 * Walks the AST and performs:
 *  1. Name resolution (undefined variable / function detection)
 *  2. Type inference (for untyped declarations)
 *  3. Type checking (mismatched operands, bad assignments, etc.)
 *  4. Control-flow checks (return outside fn, break outside loop)
 *  5. Unused variable warnings
 *  6. Duplicate declaration detection
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
exports.SemanticAnalyser = exports.AMBIGUOUS_STDLIB_SYMBOLS = exports.UNIQUE_STDLIB_SYMBOLS = void 0;
exports.analyse = analyse;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const index_js_1 = require("../errors/index.js");
const index_js_2 = require("../utils/index.js");
const scope_js_1 = require("./scope.js");
const lexer_js_1 = require("../lexer/lexer.js");
const parser_js_1 = require("../parser/parser.js");
const types_js_1 = require("./types.js");
// ─── Type annotation resolver ─────────────────────────────────────────────────
function resolveTypeExpr(te, structs, typeParams, typeParamBounds) {
    switch (te.kind) {
        case "NamedType": {
            if (typeParams && typeParams.has(te.name)) {
                const bound = typeParamBounds ? typeParamBounds[te.name] : undefined;
                return (0, types_js_1.makeTypeParam)(te.name, bound);
            }
            switch (te.name) {
                case "Int":
                case "int": return types_js_1.T_INT;
                case "Float":
                case "float": return types_js_1.T_FLOAT;
                case "String":
                case "string": return types_js_1.T_STRING;
                case "Bool":
                case "bool": return types_js_1.T_BOOL;
                case "Null":
                case "null": return types_js_1.T_NULL;
                case "Any":
                case "any": return types_js_1.T_ANY;
                case "Future":
                case "future": return (0, types_js_1.makeFuture)(types_js_1.T_ANY);
                case "Result":
                case "result": return (0, types_js_1.makeResult)(types_js_1.T_ANY, types_js_1.T_ANY);
                default: {
                    const st = structs.get(te.name);
                    return st ?? types_js_1.T_UNKNOWN;
                }
            }
        }
        case "ArrayType":
            return (0, types_js_1.makeArray)(resolveTypeExpr(te.elementType, structs, typeParams, typeParamBounds));
        case "FunctionType": {
            const params = te.params.map((p) => resolveTypeExpr(p, structs, typeParams, typeParamBounds));
            const ret = te.returnType ? resolveTypeExpr(te.returnType, structs, typeParams, typeParamBounds) : types_js_1.T_NULL;
            return (0, types_js_1.makeFunction)(params, ret);
        }
        case "NullableType":
            return (0, types_js_1.makeNullable)(resolveTypeExpr(te.inner, structs, typeParams, typeParamBounds));
    }
}
// ─── Standard Library Symbol Mapping for E301 suggestions ─────────────────────
exports.UNIQUE_STDLIB_SYMBOLS = {
    // math
    PI: "math",
    E: "math",
    INF: "math",
    NAN: "math",
    sqrt: "math",
    abs: "math",
    ceil: "math",
    floor: "math",
    round: "math",
    sin: "math",
    cos: "math",
    tan: "math",
    asin: "math",
    acos: "math",
    atan: "math",
    atan2: "math",
    log: "math",
    log2: "math",
    log10: "math",
    pow: "math",
    exp: "math",
    min: "math",
    max: "math",
    trunc: "math",
    sign: "math",
    random: "math",
    is_nan: "math",
    is_finite: "math",
    clamp: "math",
    // string
    upper: "string",
    lower: "string",
    trim: "string",
    split: "string",
    replace: "string",
    starts_with: "string",
    ends_with: "string",
    repeat: "string",
    char_at: "string",
    char_code: "string",
    from_char_code: "string",
    format: "string",
    // array
    push: "array",
    pop: "array",
    shift: "array",
    unshift: "array",
    concat: "array",
    reverse: "array",
    sort: "array",
    flat: "array",
    fill: "array",
    find: "array",
    every: "array",
    some: "array",
    reduce: "array",
    filter: "array",
    take: "array",
    skip: "array",
    zip: "array",
    enumerate: "array",
    all: "array",
    // io
    eprint: "io",
    read_line: "io",
    // time
    now: "time",
    now_secs: "time",
    format_date: "time",
    // fs
    read: "fs",
    read_file: "fs",
    write: "fs",
    write_file: "fs",
    append: "fs",
    append_file: "fs",
    exists: "fs",
    delete: "fs",
    delete_file: "fs",
    list_dir: "fs",
    mkdir: "fs",
    make_dir: "fs",
    is_file: "fs",
    is_dir: "fs",
    // json
    parse: "json",
    stringify: "json",
    stringify_pretty: "json",
    // path
    dirname: "path",
    basename: "path",
    extname: "path",
    resolve: "path",
    relative: "path",
    is_absolute: "path",
    sep: "path",
    // env
    set: "env",
    args: "env",
    // buffer
    from_string: "buffer",
    alloc: "buffer",
    // process
    run: "process",
    // http
    post: "http",
    serve: "http",
    metrics: "http",
    // ffi
    open: "ffi",
    // result
    ok: "result",
    err: "result",
    is_ok: "result",
    is_err: "result",
    unwrap: "result",
    unwrap_or: "result",
    map_err: "result",
    and_then: "result",
    unwrap_err: "result",
};
exports.AMBIGUOUS_STDLIB_SYMBOLS = new Set([
    "len",
    "join",
    "contains",
    "slice",
    "index_of",
    "map",
    "sleep",
    "get",
    "any",
    "int",
    "float",
]);
// ─── Analyser class ───────────────────────────────────────────────────────────
class SemanticAnalyser {
    reporter;
    source;
    scope;
    structs = new Map();
    structMethods = new Map();
    traits = new Map();
    structTraits = new Map();
    traitImpls = new Set();
    currentFunctionReturn = null;
    currentFunctionIsAsync = false;
    importedModules = new Set();
    loadedImportPaths = new Set();
    constructor(reporter, source) {
        this.reporter = reporter;
        this.source = source;
        this.scope = (0, scope_js_1.createGlobalScope)();
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
        for (const s of ast.statements) {
            if (s.kind === "ImportStmt") {
                this.scanImportedAst(s.source, nextBase);
            }
            const decl = s.kind === "ExportStmt" ? s.declaration : s;
            if (decl.kind === "TraitDeclStmt") {
                if (!this.traits.has(decl.name)) {
                    this.hoistTraitDecl(decl);
                }
            }
            else if (decl.kind === "StructDeclStmt") {
                if (!this.structs.has(decl.name)) {
                    const fields = new Map();
                    for (const f of decl.fields) {
                        fields.set(f.name, resolveTypeExpr(f.typeAnnotation, this.structs));
                    }
                    const st = { kind: "Struct", name: decl.name, fields };
                    this.structs.set(decl.name, st);
                }
            }
            else if (decl.kind === "ImplBlockStmt") {
                this.hoistImplBlock(decl);
            }
            else if (decl.kind === "FunctionDeclStmt" && decl.typeParams && decl.typeParams.length > 0) {
                const typeParams = new Set(decl.typeParams);
                const params = decl.params.map((p) => p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, decl.typeParamBounds) : types_js_1.T_ANY);
                const ret = decl.returnType
                    ? resolveTypeExpr(decl.returnType, this.structs, typeParams, decl.typeParamBounds)
                    : types_js_1.T_ANY;
                const fnType = (0, types_js_1.makeFunction)(params, ret);
                const sym = this.scope.lookup(decl.name);
                if (sym) {
                    sym.type = fnType;
                }
                else {
                    this.scope.define({
                        name: decl.name,
                        type: fnType,
                        mutable: false,
                        defined: true,
                        used: false,
                        declSpan: decl.span,
                        isFunction: true,
                        isStruct: false,
                    });
                }
            }
        }
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    analyse(program) {
        // First pass: hoist struct and function declarations
        this.hoistDeclarations(program.statements);
        // Second pass: full analysis
        for (const stmt of program.statements) {
            this.analyseStmt(stmt);
        }
        // Warn about unused variables in global scope
        this.warnUnused(this.scope);
    }
    // ── Hoisting ──────────────────────────────────────────────────────────────
    hoistDeclarations(stmts) {
        // -1. Hoist import specifiers so imported traits and types are known
        for (const stmt of stmts) {
            if (stmt.kind === "ImportStmt") {
                this.analyseImport(stmt);
            }
        }
        // 0. Hoist trait declarations
        for (const stmt of stmts) {
            const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
            if (decl.kind === "TraitDeclStmt") {
                this.hoistTraitDecl(decl);
            }
        }
        // 1. Hoist struct declarations
        for (const stmt of stmts) {
            const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
            if (decl.kind === "StructDeclStmt") {
                const fields = new Map();
                for (const f of decl.fields) {
                    fields.set(f.name, resolveTypeExpr(f.typeAnnotation, this.structs));
                }
                const st = { kind: "Struct", name: decl.name, fields };
                this.structs.set(decl.name, st);
                this.scope.define({
                    name: decl.name,
                    type: st,
                    mutable: false,
                    defined: true,
                    used: false,
                    declSpan: decl.span,
                    isFunction: false,
                    isStruct: true,
                });
            }
        }
        // 2. Hoist impl blocks
        for (const stmt of stmts) {
            const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
            if (decl.kind === "ImplBlockStmt") {
                this.hoistImplBlock(decl);
            }
        }
        // 3. Hoist function declarations
        for (const stmt of stmts) {
            const decl = stmt.kind === "ExportStmt" ? stmt.declaration : stmt;
            if (decl.kind === "FunctionDeclStmt") {
                const typeParams = decl.typeParams ? new Set(decl.typeParams) : undefined;
                const params = decl.params.map((p) => p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, decl.typeParamBounds) : types_js_1.T_ANY);
                const rawRet = decl.returnType
                    ? resolveTypeExpr(decl.returnType, this.structs, typeParams, decl.typeParamBounds)
                    : types_js_1.T_ANY;
                const ret = decl.isAsync ? (0, types_js_1.makeFuture)(rawRet) : rawRet;
                this.scope.define({
                    name: decl.name,
                    type: (0, types_js_1.makeFunction)(params, ret),
                    mutable: false,
                    defined: true,
                    used: false,
                    declSpan: decl.span,
                    isFunction: true,
                    isStruct: false,
                });
            }
        }
    }
    hoistTraitDecl(stmt) {
        if (this.traits.has(stmt.name)) {
            this.reporter.error(index_js_1.ErrorCode.E304, `Trait \`${stmt.name}\` is already declared in this scope`, stmt.span);
            return;
        }
        const methods = new Map();
        for (const m of stmt.methods) {
            if (methods.has(m.name)) {
                this.reporter.error(index_js_1.ErrorCode.E304, `Method \`${m.name}\` is declared more than once in trait \`${stmt.name}\``, m.span);
                continue;
            }
            if (m.params.length === 0 || m.params[0].name !== "self") {
                this.reporter.error(index_js_1.ErrorCode.E307, `First parameter of trait method \`${m.name}\` must be \`self\``, m.span);
            }
            const params = [];
            for (let i = 1; i < m.params.length; i++) {
                const p = m.params[i];
                params.push(p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : types_js_1.T_ANY);
            }
            const ret = m.returnType ? resolveTypeExpr(m.returnType, this.structs) : types_js_1.T_ANY;
            methods.set(m.name, {
                params,
                returnType: ret,
                paramNames: m.params.map((p) => p.name),
                span: m.span,
            });
        }
        this.traits.set(stmt.name, {
            name: stmt.name,
            methods,
            span: stmt.span,
        });
    }
    hoistImplBlock(stmt) {
        const st = this.structs.get(stmt.structName);
        if (!st) {
            this.reporter.error(index_js_1.ErrorCode.E301, `Cannot find struct \`${stmt.structName}\` in scope`, stmt.span);
            return;
        }
        if (!this.structMethods.has(stmt.structName)) {
            this.structMethods.set(stmt.structName, new Map());
        }
        const methods = this.structMethods.get(stmt.structName);
        let trait = null;
        if (stmt.traitName) {
            trait = this.traits.get(stmt.traitName) ?? null;
            if (!trait) {
                this.reporter.error(index_js_1.ErrorCode.E301, `Cannot find trait \`${stmt.traitName}\` in scope`, stmt.span);
                return;
            }
            const implKey = `${stmt.traitName}#${stmt.structName}`;
            if (this.traitImpls.has(implKey)) {
                this.reporter.error(index_js_1.ErrorCode.E304, `Duplicate implementation of trait \`${stmt.traitName}\` for struct \`${stmt.structName}\``, stmt.span);
                return;
            }
            this.traitImpls.add(implKey);
            if (!this.structTraits.has(stmt.structName)) {
                this.structTraits.set(stmt.structName, new Set());
            }
            this.structTraits.get(stmt.structName).add(stmt.traitName);
            const implMethodNames = new Set(stmt.methods.map((m) => m.name));
            for (const [reqName, reqMethod] of trait.methods) {
                if (!implMethodNames.has(reqName)) {
                    this.reporter.error(index_js_1.ErrorCode.E308, `Struct \`${stmt.structName}\` does not implement required method \`${reqName}\` of trait \`${stmt.traitName}\``, stmt.span, { help: [`Implement method \`fn ${reqName}(self, ...)\` in \`impl ${stmt.traitName} for ${stmt.structName}\``] });
                }
            }
        }
        for (const method of stmt.methods) {
            if (st.fields.has(method.name)) {
                this.reporter.error(index_js_1.ErrorCode.E304, `Method \`${method.name}\` conflicts with existing field \`${method.name}\` on struct \`${stmt.structName}\``, method.span);
                continue;
            }
            if (methods.has(method.name)) {
                this.reporter.error(index_js_1.ErrorCode.E304, `Method \`${method.name}\` is already defined for struct \`${stmt.structName}\``, method.span);
                continue;
            }
            if (method.params.length === 0 || method.params[0].name !== "self") {
                this.reporter.error(index_js_1.ErrorCode.E307, `First parameter of method \`${method.name}\` must be \`self\``, method.span);
                continue;
            }
            if (trait) {
                const reqMethod = trait.methods.get(method.name);
                if (reqMethod) {
                    if (method.params.length !== reqMethod.params.length + 1) {
                        this.reporter.error(index_js_1.ErrorCode.E307, `Expected ${reqMethod.params.length + 1} parameter(s) for method \`${method.name}\`, got ${method.params.length}`, method.span);
                    }
                    for (let i = 1; i < method.params.length && i - 1 < reqMethod.params.length; i++) {
                        const actualParam = method.params[i].typeAnnotation
                            ? resolveTypeExpr(method.params[i].typeAnnotation, this.structs)
                            : types_js_1.T_ANY;
                        const expectedParam = reqMethod.params[i - 1];
                        if (actualParam.kind !== "Any" &&
                            expectedParam.kind !== "Any" &&
                            !(0, types_js_1.typesEqual)(actualParam, expectedParam)) {
                            this.reporter.error(index_js_1.ErrorCode.E303, `Type mismatch in parameter \`${method.params[i].name}\` of method \`${method.name}\`: expected \`${(0, types_js_1.typeToString)(expectedParam)}\`, got \`${(0, types_js_1.typeToString)(actualParam)}\``, method.params[i].span);
                        }
                    }
                    const actualRet = method.returnType
                        ? resolveTypeExpr(method.returnType, this.structs)
                        : types_js_1.T_ANY;
                    if (actualRet.kind !== "Any" &&
                        reqMethod.returnType.kind !== "Any" &&
                        !(0, types_js_1.typesEqual)(actualRet, reqMethod.returnType)) {
                        this.reporter.error(index_js_1.ErrorCode.E303, `Type mismatch in return type of method \`${method.name}\`: expected \`${(0, types_js_1.typeToString)(reqMethod.returnType)}\`, got \`${(0, types_js_1.typeToString)(actualRet)}\``, method.span);
                    }
                }
            }
            const params = [st];
            for (let i = 1; i < method.params.length; i++) {
                const p = method.params[i];
                params.push(p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : types_js_1.T_ANY);
            }
            const ret = method.returnType
                ? resolveTypeExpr(method.returnType, this.structs)
                : types_js_1.T_ANY;
            const fnType = (0, types_js_1.makeFunction)(params, ret);
            methods.set(method.name, fnType);
            const mangled = `${stmt.structName}__${method.name}`;
            this.scope.define({
                name: mangled,
                type: fnType,
                mutable: false,
                defined: true,
                used: false,
                declSpan: method.span,
                isFunction: true,
                isStruct: false,
            });
        }
    }
    // ── Statement analysis ────────────────────────────────────────────────────
    analyseStmt(stmt) {
        switch (stmt.kind) {
            case "VarDeclStmt":
                this.analyseVarDecl(stmt);
                break;
            case "ConstDeclStmt":
                this.analyseConstDecl(stmt);
                break;
            case "FunctionDeclStmt":
                this.analyseFunctionDecl(stmt);
                break;
            case "StructDeclStmt": /* already hoisted */ break;
            case "ImplBlockStmt":
                this.analyseImplBlock(stmt);
                break;
            case "TraitDeclStmt": /* already hoisted */ break;
            case "TypeAliasStmt": break;
            case "ReturnStmt":
                this.analyseReturn(stmt);
                break;
            case "BreakStmt":
                this.analyseBreak(stmt);
                break;
            case "ContinueStmt":
                this.analyseContinue(stmt);
                break;
            case "IfStmt":
                this.analyseIfStmt(stmt);
                break;
            case "WhileStmt":
                this.analyseWhile(stmt);
                break;
            case "ForStmt":
                this.analyseFor(stmt);
                break;
            case "BlockStmt":
                this.analyseBlock(stmt);
                break;
            case "ExprStmt":
                this.analyseExpr(stmt.expr);
                break;
            case "ImportStmt":
                this.analyseImport(stmt);
                break;
            case "ExportStmt":
                this.analyseStmt(stmt.declaration);
                break;
            case "TestStmt":
                this.analyseTest(stmt);
                break;
            case "AssertStmt":
                this.analyseAssert(stmt);
                break;
        }
    }
    analyseImplBlock(stmt) {
        const st = this.structs.get(stmt.structName);
        if (!st)
            return;
        for (const method of stmt.methods) {
            this.analyseMethod(st, method);
        }
    }
    analyseMethod(st, method) {
        const prevReturn = this.currentFunctionReturn;
        const retType = method.returnType ? resolveTypeExpr(method.returnType, this.structs) : types_js_1.T_ANY;
        this.currentFunctionReturn = retType;
        const fnScope = new scope_js_1.Scope(this.scope, true, false);
        const prevScope = this.scope;
        this.scope = fnScope;
        if (method.params.length > 0 && method.params[0].name === "self") {
            this.scope.define({
                name: "self",
                type: st,
                mutable: false,
                defined: true,
                used: false,
                declSpan: method.params[0].span,
                isFunction: false,
                isStruct: false,
            });
        }
        for (let i = 1; i < method.params.length; i++) {
            const p = method.params[i];
            const pType = p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : types_js_1.T_ANY;
            this.scope.define({
                name: p.name,
                type: pType,
                mutable: true,
                defined: true,
                used: false,
                declSpan: p.span,
                isFunction: false,
                isStruct: false,
            });
        }
        for (const s of method.body.body) {
            this.analyseStmt(s);
        }
        this.warnUnused(fnScope);
        this.scope = prevScope;
        this.currentFunctionReturn = prevReturn;
    }
    /**
       * Register an imported module in the current scope so that its members can be
       * referenced. Bare imports bound the whole module to `defaultName` (the only
       * form the runtime currently wires up), which is typed as dynamic (Any).
       */
    analyseImport(stmt) {
        const raw = stmt.source;
        const base = raw.startsWith("std.") ? raw.slice(4) : raw;
        this.importedModules.add(raw);
        this.importedModules.add(base);
        if (stmt.source.startsWith("./") || stmt.source.startsWith("../") || stmt.source.endsWith(".hkd")) {
            this.scanImportedAst(stmt.source);
        }
        if (stmt.specifiers && stmt.specifiers.length > 0) {
            for (const spec of stmt.specifiers) {
                const importName = spec.alias ?? spec.name;
                const resolvedGlobal = this.scope.lookup(spec.name);
                if (this.scope.lookupLocal(importName) === null) {
                    this.scope.define({
                        name: importName,
                        type: resolvedGlobal?.type ?? types_js_1.T_ANY,
                        mutable: false,
                        defined: true,
                        used: false,
                        declSpan: spec.span,
                        isFunction: resolvedGlobal?.isFunction ?? true,
                        isStruct: resolvedGlobal?.isStruct ?? true,
                    });
                }
                else if (resolvedGlobal && resolvedGlobal.type && resolvedGlobal.type.kind !== "Any") {
                    const sym = this.scope.lookupLocal(importName);
                    if (sym) {
                        sym.type = resolvedGlobal.type;
                        sym.isFunction = resolvedGlobal.isFunction;
                        sym.isStruct = resolvedGlobal.isStruct;
                    }
                }
                if (!this.structs.has(importName)) {
                    this.structs.set(importName, {
                        kind: "Struct",
                        name: importName,
                        fields: new Map(),
                    });
                }
                if (!this.traits.has(importName)) {
                    this.traits.set(importName, {
                        name: importName,
                        methods: new Map(),
                        span: spec.span,
                    });
                }
            }
        }
        if (stmt.defaultName && this.scope.lookupLocal(stmt.defaultName) === null) {
            this.importedModules.add(stmt.defaultName);
            this.scope.define({
                name: stmt.defaultName,
                type: types_js_1.T_ANY,
                mutable: false,
                defined: true,
                used: false,
                declSpan: stmt.span,
                isFunction: false,
                isStruct: false,
            });
        }
    }
    analyseVarDecl(stmt) {
        let type = types_js_1.T_UNKNOWN;
        if (stmt.initializer) {
            type = this.analyseExpr(stmt.initializer);
        }
        if (stmt.typeAnnotation) {
            const annotated = resolveTypeExpr(stmt.typeAnnotation, this.structs);
            if (stmt.initializer && !(0, types_js_1.isAssignable)(annotated, type)) {
                this.typeMismatch(annotated, type, stmt.initializer.span, `Cannot assign \`${(0, types_js_1.typeToString)(type)}\` to \`${(0, types_js_1.typeToString)(annotated)}\``);
            }
            type = annotated;
        }
        const ok = this.scope.define({
            name: stmt.name,
            type,
            mutable: true,
            defined: true,
            used: false,
            declSpan: stmt.span,
            isFunction: false,
            isStruct: false,
        });
        if (!ok) {
            this.reporter.error(index_js_1.ErrorCode.E304, `Variable \`${stmt.name}\` is already declared in this scope`, stmt.span);
        }
    }
    analyseConstDecl(stmt) {
        const initType = this.analyseExpr(stmt.initializer);
        let type = initType;
        if (stmt.typeAnnotation) {
            const annotated = resolveTypeExpr(stmt.typeAnnotation, this.structs);
            if (!(0, types_js_1.isAssignable)(annotated, initType)) {
                this.typeMismatch(annotated, initType, stmt.initializer.span, `Cannot assign \`${(0, types_js_1.typeToString)(initType)}\` to \`${(0, types_js_1.typeToString)(annotated)}\``);
            }
            type = annotated;
        }
        const ok = this.scope.define({
            name: stmt.name,
            type,
            mutable: false,
            defined: true,
            used: false,
            declSpan: stmt.span,
            isFunction: false,
            isStruct: false,
        });
        if (!ok) {
            this.reporter.error(index_js_1.ErrorCode.E304, `\`${stmt.name}\` is already declared in this scope`, stmt.span);
        }
    }
    analyseFunctionDecl(stmt) {
        const prevReturn = this.currentFunctionReturn;
        const prevAsync = this.currentFunctionIsAsync;
        this.currentFunctionIsAsync = Boolean(stmt.isAsync);
        const typeParams = stmt.typeParams ? new Set(stmt.typeParams) : undefined;
        const retType = stmt.returnType
            ? resolveTypeExpr(stmt.returnType, this.structs, typeParams, stmt.typeParamBounds)
            : types_js_1.T_ANY;
        // Register the function's own name in the enclosing scope so that nested
        // named functions (and recursion) resolve. At top level the name was already
        // hoisted, so define() simply returns false — harmless.
        const effectiveRet = stmt.isAsync ? (0, types_js_1.makeFuture)(retType) : retType;
        const fnType = (0, types_js_1.makeFunction)(stmt.params.map((p) => p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, stmt.typeParamBounds) : types_js_1.T_ANY), effectiveRet);
        if (this.scope.lookupLocal(stmt.name) === null) {
            this.scope.define({
                name: stmt.name,
                type: fnType,
                mutable: false,
                defined: true,
                used: false,
                declSpan: stmt.span,
                isFunction: true,
                isStruct: false,
            });
        }
        this.currentFunctionReturn = retType;
        const child = new scope_js_1.Scope(this.scope, true, false);
        const prevScope = this.scope;
        this.scope = child;
        // Define parameters in function scope
        for (const param of stmt.params) {
            const paramType = param.typeAnnotation
                ? resolveTypeExpr(param.typeAnnotation, this.structs, typeParams, stmt.typeParamBounds)
                : types_js_1.T_ANY;
            child.define({
                name: param.name,
                type: paramType,
                mutable: true,
                defined: true,
                used: false,
                declSpan: param.span,
                isFunction: false,
                isStruct: false,
            });
            if (param.defaultValue) {
                this.analyseExpr(param.defaultValue);
            }
        }
        for (const s of stmt.body.body) {
            this.analyseStmt(s);
        }
        this.warnUnused(child);
        this.scope = prevScope;
        this.currentFunctionReturn = prevReturn;
        this.currentFunctionIsAsync = prevAsync;
    }
    analyseReturn(stmt) {
        if (!this.scope.isInsideFunction()) {
            this.reporter.error(index_js_1.ErrorCode.E305, "`return` outside of function", stmt.span, { help: ["Move this `return` inside a `fn` body"] });
        }
        if (stmt.value) {
            const t = this.analyseExpr(stmt.value);
            if (this.currentFunctionReturn &&
                this.currentFunctionReturn.kind !== "Any" &&
                !(0, types_js_1.isAssignable)(this.currentFunctionReturn, t)) {
                this.typeMismatch(this.currentFunctionReturn, t, stmt.value.span, `Return type mismatch: expected \`${(0, types_js_1.typeToString)(this.currentFunctionReturn)}\`, got \`${(0, types_js_1.typeToString)(t)}\``);
            }
        }
    }
    analyseBreak(stmt) {
        if (!this.scope.isInsideLoop()) {
            this.reporter.error(index_js_1.ErrorCode.E306, "`break` outside of loop", stmt.span);
        }
    }
    analyseContinue(stmt) {
        if (!this.scope.isInsideLoop()) {
            this.reporter.error(index_js_1.ErrorCode.E306, "`continue` outside of loop", stmt.span);
        }
    }
    analyseIfStmt(stmt) {
        const condType = this.analyseExpr(stmt.condition);
        if (condType.kind !== "Bool" && condType.kind !== "Any" && condType.kind !== "Unknown") {
            this.typeMismatch(types_js_1.T_BOOL, condType, stmt.condition.span, `Condition must be \`Bool\`, found \`${(0, types_js_1.typeToString)(condType)}\``);
        }
        this.analyseBlock(stmt.then);
        if (stmt.else_) {
            if (stmt.else_.kind === "IfStmt")
                this.analyseIfStmt(stmt.else_);
            else
                this.analyseBlock(stmt.else_);
        }
    }
    analyseWhile(stmt) {
        this.analyseExpr(stmt.condition);
        const loopScope = new scope_js_1.Scope(this.scope, false, true);
        const prev = this.scope;
        this.scope = loopScope;
        for (const s of stmt.body.body)
            this.analyseStmt(s);
        this.warnUnused(loopScope);
        this.scope = prev;
    }
    analyseFor(stmt) {
        const iterType = this.analyseExpr(stmt.iterable);
        let elemType = types_js_1.T_ANY;
        if (iterType.kind === "Array") {
            elemType = iterType.elementType;
        }
        const loopScope = new scope_js_1.Scope(this.scope, false, true);
        const prev = this.scope;
        this.scope = loopScope;
        loopScope.define({
            name: stmt.variable,
            type: elemType,
            mutable: false,
            defined: true,
            used: false,
            declSpan: stmt.span,
            isFunction: false,
            isStruct: false,
        });
        for (const s of stmt.body.body)
            this.analyseStmt(s);
        this.warnUnused(loopScope);
        this.scope = prev;
    }
    analyseBlock(stmt) {
        const child = new scope_js_1.Scope(this.scope);
        const prev = this.scope;
        this.scope = child;
        for (const s of stmt.body)
            this.analyseStmt(s);
        this.warnUnused(child);
        this.scope = prev;
    }
    analyseTest(stmt) {
        this.analyseBlock(stmt.body);
    }
    analyseAssert(stmt) {
        this.analyseExpr(stmt.condition);
        if (stmt.message)
            this.analyseExpr(stmt.message);
    }
    // ── Expression analysis ───────────────────────────────────────────────────
    analyseExpr(expr) {
        const type = this.analyseExprInternal(expr);
        expr.inferredType = type;
        return type;
    }
    analyseExprInternal(expr) {
        switch (expr.kind) {
            case "IntLiteral": return types_js_1.T_INT;
            case "FloatLiteral": return types_js_1.T_FLOAT;
            case "StringLiteral": return types_js_1.T_STRING;
            case "BoolLiteral": return types_js_1.T_BOOL;
            case "NullLiteral": return types_js_1.T_NULL;
            case "IdentExpr": {
                const sym = this.scope.lookup(expr.name);
                if (!sym) {
                    const stdMod = !exports.AMBIGUOUS_STDLIB_SYMBOLS.has(expr.name)
                        ? exports.UNIQUE_STDLIB_SYMBOLS[expr.name]
                        : undefined;
                    if (stdMod) {
                        if (this.importedModules.has(stdMod)) {
                            this.reporter.error(index_js_1.ErrorCode.E301, `Undefined variable \`${expr.name}\``, expr.span, {
                                label: "not found in scope",
                                help: [
                                    `\`${expr.name}\` is exported by module \`${stdMod}\`. Use \`${stdMod}.${expr.name}\` to access it.`,
                                ],
                            });
                        }
                        else {
                            this.reporter.error(index_js_1.ErrorCode.E301, `Undefined variable \`${expr.name}\``, expr.span, {
                                label: "not found in scope",
                                help: [
                                    `\`${expr.name}\` is available from the \`${stdMod}\` standard library module.`,
                                    `To use it, add: import ${stdMod}`,
                                ],
                            });
                        }
                    }
                    else {
                        const all = this.collectAllNames();
                        const suggestion = (0, index_js_2.findClosestMatch)(expr.name, all);
                        this.reporter.error(index_js_1.ErrorCode.E301, `Undefined variable \`${expr.name}\``, expr.span, {
                            label: "not found in scope",
                            help: suggestion ? [`Did you mean \`${suggestion}\`?`] : undefined,
                        });
                    }
                    return types_js_1.T_UNKNOWN;
                }
                this.scope.markUsed(expr.name);
                return sym.type;
            }
            case "BinaryExpr": return this.analyseBinary(expr);
            case "UnaryExpr": return this.analyseUnary(expr);
            case "CallExpr": return this.analyseCall(expr);
            case "IndexExpr": return this.analyseIndex(expr);
            case "MemberExpr": return this.analyseMember(expr);
            case "AssignExpr": return this.analyseAssign(expr);
            case "CompoundAssignExpr": return this.analyseCompoundAssign(expr);
            case "ArrayExpr": return this.analyseArray(expr);
            case "ObjectExpr": return this.analyseObject(expr);
            case "FunctionExpr": return this.analyseFunctionExpr(expr);
            case "IfExpr": return this.analyseIfExpr(expr);
            case "BlockExpr": return this.analyseBlockExpr(expr);
            case "StructInitExpr": return this.analyseStructInit(expr);
            case "RangeExpr": return (0, types_js_1.makeArray)(types_js_1.T_INT);
            case "CastExpr": return resolveTypeExpr(expr.targetType, this.structs);
            case "MatchExpr": return this.analyseMatchExpr(expr);
            case "AwaitExpr": return this.analyseAwaitExpr(expr);
        }
    }
    analyseAwaitExpr(expr) {
        if (!this.currentFunctionIsAsync) {
            this.reporter.error(index_js_1.ErrorCode.E305, "`await` is only allowed inside async functions", expr.span, { help: ["Add `async` keyword to the enclosing function declaration"] });
        }
        const t = this.analyseExpr(expr.expr);
        if (t.kind === "Future") {
            return t.valueType;
        }
        return t;
    }
    analyseBinary(expr) {
        const left = this.analyseExpr(expr.left);
        const right = this.analyseExpr(expr.right);
        switch (expr.op) {
            case "+":
                if (left.kind === "String" || right.kind === "String")
                    return types_js_1.T_STRING;
                if (left.kind === "Float" || right.kind === "Float")
                    return types_js_1.T_FLOAT;
                return types_js_1.T_INT;
            case "-":
            case "*":
            case "/":
            case "%":
            case "**":
                if (left.kind === "Float" || right.kind === "Float")
                    return types_js_1.T_FLOAT;
                return types_js_1.T_INT;
            case "==":
            case "!=":
            case "<":
            case "<=":
            case ">":
            case ">=":
                return types_js_1.T_BOOL;
            case "&&":
            case "||":
                return types_js_1.T_BOOL;
            case "&":
            case "|":
            case "^":
            case "<<":
            case ">>":
                return types_js_1.T_INT;
            default:
                return types_js_1.T_ANY;
        }
    }
    analyseUnary(expr) {
        const t = this.analyseExpr(expr.operand);
        switch (expr.op) {
            case "-": return t.kind === "Float" ? types_js_1.T_FLOAT : types_js_1.T_INT;
            case "!": return types_js_1.T_BOOL;
            case "~": return types_js_1.T_INT;
        }
    }
    analyseCall(expr) {
        // Struct method invocation
        if (expr.callee.kind === "MemberExpr") {
            const objType = this.analyseExpr(expr.callee.object);
            if (objType.kind === "Struct") {
                const method = this.structMethods.get(objType.name)?.get(expr.callee.property);
                if (method) {
                    expr.callee.isMethodCall = true;
                    expr.callee.structName = objType.name;
                    expr.callee.methodName = expr.callee.property;
                    const expectedParams = method.params.slice(1);
                    const argTypes = expr.args.map((a) => this.analyseExpr(a));
                    if (expr.args.length !== expectedParams.length) {
                        this.reporter.error(index_js_1.ErrorCode.E307, `Method \`${expr.callee.property}\` expects ${expectedParams.length} argument(s), got ${expr.args.length}`, expr.span);
                    }
                    else {
                        for (let i = 0; i < expr.args.length; i++) {
                            const expected = expectedParams[i];
                            const actual = argTypes[i];
                            if (expected &&
                                actual &&
                                expected.kind !== "Any" &&
                                expected.kind !== "Unknown" &&
                                actual.kind !== "Any" &&
                                actual.kind !== "Unknown" &&
                                !(0, types_js_1.isAssignable)(expected, actual)) {
                                this.typeMismatch(expected, actual, expr.args[i].span, `Argument ${i + 1} of method \`${expr.callee.property}\` expects \`${(0, types_js_1.typeToString)(expected)}\`, got \`${(0, types_js_1.typeToString)(actual)}\``);
                            }
                        }
                    }
                    return method.returnType;
                }
            }
            else if (objType.kind === "TypeParam") {
                if (!objType.bound) {
                    this.reporter.error(index_js_1.ErrorCode.E309, `Cannot call method \`${expr.callee.property}\` on unconstrained type parameter \`${objType.name}\``, expr.callee.span, { help: [`Add trait bound: \`<${objType.name}: TraitName>\``] });
                    return types_js_1.T_UNKNOWN;
                }
                const trait = this.traits.get(objType.bound);
                if (trait) {
                    if (trait.methods.size === 0) {
                        // External/imported trait without local definitions
                        expr.callee.isTraitCall = true;
                        expr.callee.traitName = objType.bound;
                        expr.callee.methodName = expr.callee.property;
                        for (const a of expr.args)
                            this.analyseExpr(a);
                        return types_js_1.T_ANY;
                    }
                    const reqMethod = trait.methods.get(expr.callee.property);
                    if (reqMethod) {
                        expr.callee.isTraitCall = true;
                        expr.callee.traitName = objType.bound;
                        expr.callee.methodName = expr.callee.property;
                        const expectedParams = reqMethod.params;
                        const argTypes = expr.args.map((a) => this.analyseExpr(a));
                        if (expr.args.length !== expectedParams.length) {
                            this.reporter.error(index_js_1.ErrorCode.E307, `Method \`${expr.callee.property}\` of trait \`${objType.bound}\` expects ${expectedParams.length} argument(s), got ${expr.args.length}`, expr.span);
                        }
                        return reqMethod.returnType;
                    }
                    else {
                        this.reporter.error(index_js_1.ErrorCode.E309, `Trait \`${objType.bound}\` has no method \`${expr.callee.property}\``, expr.callee.span);
                        return types_js_1.T_UNKNOWN;
                    }
                }
            }
        }
        const calleeType = this.analyseExpr(expr.callee);
        const argTypes = expr.args.map((a) => this.analyseExpr(a));
        if (calleeType.kind === "Function") {
            // Validate trait constraints on generic parameters
            for (let i = 0; i < calleeType.params.length && i < argTypes.length; i++) {
                const param = calleeType.params[i];
                if (param.kind === "TypeParam" && param.bound) {
                    const argType = argTypes[i];
                    if (argType && argType.kind === "Struct") {
                        const hasTrait = this.structTraits.get(argType.name)?.has(param.bound);
                        if (!hasTrait) {
                            this.reporter.error(index_js_1.ErrorCode.E308, `Type \`${argType.name}\` does not implement trait \`${param.bound}\``, expr.args[i].span, { help: [`Implement \`impl ${param.bound} for ${argType.name} { ... }\``] });
                        }
                    }
                    else if (argType && argType.kind !== "Any" && argType.kind !== "Unknown" && argType.kind !== "TypeParam") {
                        this.reporter.error(index_js_1.ErrorCode.E308, `Type \`${(0, types_js_1.typeToString)(argType)}\` does not implement trait \`${param.bound}\``, expr.args[i].span);
                    }
                }
            }
            // Record monomorphic specialization for trait-bounded generic call
            if (calleeType.params.some((p) => p.kind === "TypeParam" && p.bound)) {
                const concreteNames = [];
                for (let i = 0; i < calleeType.params.length && i < argTypes.length; i++) {
                    const p = calleeType.params[i];
                    if (p.kind === "TypeParam" && p.bound && argTypes[i]) {
                        const at = argTypes[i];
                        if (at.kind === "Struct") {
                            concreteNames.push(at.name);
                        }
                    }
                }
                if (concreteNames.length > 0 && expr.callee.kind === "IdentExpr") {
                    const monoName = `${expr.callee.name}__${concreteNames.join("__")}`;
                    expr.monomorphizedName = monoName;
                    expr.monoArgTypes = argTypes;
                }
            }
            if (expr.args.length !== calleeType.params.length &&
                calleeType.params[calleeType.params.length - 1]?.kind !== "Any") {
                // Allow any-typed params for variadic builtins
                if (!calleeType.params.some((p) => p.kind === "Any")) {
                    this.reporter.error(index_js_1.ErrorCode.E307, `Expected ${calleeType.params.length} argument(s), got ${expr.args.length}`, expr.span);
                }
            }
            let ret = calleeType.returnType;
            if (ret.kind === "TypeParam") {
                if (expr.typeArgs && expr.typeArgs.length > 0) {
                    ret = resolveTypeExpr(expr.typeArgs[0], this.structs);
                }
                else {
                    for (let i = 0; i < calleeType.params.length; i++) {
                        if (calleeType.params[i].kind === "TypeParam" &&
                            calleeType.params[i].name === ret.name &&
                            argTypes[i]) {
                            ret = argTypes[i];
                            break;
                        }
                    }
                }
            }
            return ret;
        }
        if (calleeType.kind !== "Any" && calleeType.kind !== "Unknown") {
            this.reporter.error(index_js_1.ErrorCode.E408, `\`${(0, types_js_1.typeToString)(calleeType)}\` is not callable`, expr.callee.span);
        }
        return types_js_1.T_ANY;
    }
    analyseIndex(expr) {
        const objType = this.analyseExpr(expr.object);
        this.analyseExpr(expr.index);
        if (objType.kind === "Array")
            return objType.elementType;
        if (objType.kind === "String")
            return types_js_1.T_STRING;
        return types_js_1.T_ANY;
    }
    analyseMember(expr) {
        const objType = this.analyseExpr(expr.object);
        if (objType.kind === "Struct") {
            if (objType.fields.size === 0 && !this.structMethods.has(objType.name)) {
                return types_js_1.T_ANY;
            }
            const fieldType = objType.fields.get(expr.property);
            if (!fieldType) {
                const method = this.structMethods.get(objType.name)?.get(expr.property);
                if (method) {
                    return method;
                }
                const available = [
                    ...Array.from(objType.fields.keys()),
                    ...(this.structMethods.get(objType.name) ? Array.from(this.structMethods.get(objType.name).keys()) : []),
                ];
                this.reporter.error(index_js_1.ErrorCode.E309, `Struct \`${objType.name}\` has no field or method \`${expr.property}\``, expr.span, {
                    help: [
                        `Available: ${available.join(", ")}`,
                    ],
                });
                return types_js_1.T_UNKNOWN;
            }
            return fieldType;
        }
        if (objType.kind === "TypeParam") {
            if (!objType.bound) {
                this.reporter.error(index_js_1.ErrorCode.E309, `Cannot access member \`${expr.property}\` on unconstrained type parameter \`${objType.name}\``, expr.span, { help: [`Add trait bound: \`<${objType.name}: TraitName>\``] });
                return types_js_1.T_UNKNOWN;
            }
            const trait = this.traits.get(objType.bound);
            if (trait) {
                if (trait.methods.size === 0) {
                    return types_js_1.T_ANY;
                }
                const m = trait.methods.get(expr.property);
                if (m) {
                    return (0, types_js_1.makeFunction)([objType, ...m.params], m.returnType);
                }
                this.reporter.error(index_js_1.ErrorCode.E309, `Trait \`${objType.bound}\` has no method \`${expr.property}\``, expr.span, { help: [`Available methods on \`${objType.bound}\`: ${Array.from(trait.methods.keys()).join(", ")}`] });
                return types_js_1.T_UNKNOWN;
            }
        }
        return types_js_1.T_ANY;
    }
    analyseAssign(expr) {
        const targetType = this.analyseExpr(expr.target);
        const valueType = this.analyseExpr(expr.value);
        // Check mutability for IdentExpr
        if (expr.target.kind === "IdentExpr") {
            if (expr.target.name === "self") {
                this.reporter.error(index_js_1.ErrorCode.E405, "Cannot assign to `self` — method receiver is immutable", expr.span);
            }
            const sym = this.scope.lookup(expr.target.name);
            if (sym && !sym.mutable) {
                this.reporter.error(index_js_1.ErrorCode.E405, `Cannot assign to \`${expr.target.name}\` — it is declared \`const\``, expr.span, { help: ["Change `const` to `let` if you need to reassign"] });
            }
            if (sym && (sym.type.kind === "Unknown" || sym.type.kind === "Null")) {
                sym.type = valueType;
            }
        }
        if (targetType.kind !== "Unknown" &&
            targetType.kind !== "Any" &&
            targetType.kind !== "Null" &&
            valueType.kind !== "Unknown" &&
            valueType.kind !== "Any" &&
            !(0, types_js_1.isAssignable)(targetType, valueType)) {
            this.typeMismatch(targetType, valueType, expr.value.span, `Cannot assign \`${(0, types_js_1.typeToString)(valueType)}\` to \`${(0, types_js_1.typeToString)(targetType)}\``);
        }
        return valueType;
    }
    analyseCompoundAssign(expr) {
        if (expr.target.kind === "IdentExpr" && expr.target.name === "self") {
            this.reporter.error(index_js_1.ErrorCode.E405, "Cannot assign to `self` — method receiver is immutable", expr.span);
        }
        const targetType = this.analyseExpr(expr.target);
        const valueType = this.analyseExpr(expr.value);
        if (expr.target.kind === "IdentExpr") {
            const sym = this.scope.lookup(expr.target.name);
            if (sym && !sym.mutable) {
                this.reporter.error(index_js_1.ErrorCode.E405, `Cannot assign to \`${expr.target.name}\` — it is declared \`const\``, expr.span, { help: ["Change `const` to `let` if you need to reassign"] });
            }
        }
        if (targetType.kind !== "Unknown" &&
            targetType.kind !== "Any" &&
            valueType.kind !== "Unknown" &&
            valueType.kind !== "Any" &&
            !(0, types_js_1.isAssignable)(targetType, valueType)) {
            this.typeMismatch(targetType, valueType, expr.value.span, `Cannot apply compound assignment \`${expr.op}\` with \`${(0, types_js_1.typeToString)(valueType)}\` to \`${(0, types_js_1.typeToString)(targetType)}\``);
        }
        return targetType;
    }
    analyseArray(expr) {
        if (expr.elements.length === 0)
            return (0, types_js_1.makeArray)(types_js_1.T_UNKNOWN);
        const firstType = this.analyseExpr(expr.elements[0]);
        for (let i = 1; i < expr.elements.length; i++) {
            this.analyseExpr(expr.elements[i]);
        }
        return (0, types_js_1.makeArray)(firstType);
    }
    analyseObject(expr) {
        for (const field of expr.fields) {
            this.analyseExpr(field.value);
        }
        return types_js_1.T_ANY;
    }
    analyseFunctionExpr(expr) {
        const typeParams = expr.typeParams ? new Set(expr.typeParams) : undefined;
        const params = expr.params.map((p) => p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams) : types_js_1.T_ANY);
        const ret = expr.returnType
            ? resolveTypeExpr(expr.returnType, this.structs, typeParams)
            : types_js_1.T_ANY;
        const prev = this.currentFunctionReturn;
        const prevAsync = this.currentFunctionIsAsync;
        this.currentFunctionIsAsync = Boolean(expr.isAsync);
        this.currentFunctionReturn = ret;
        const child = new scope_js_1.Scope(this.scope, true, false);
        const prevScope = this.scope;
        this.scope = child;
        for (let i = 0; i < expr.params.length; i++) {
            child.define({
                name: expr.params[i].name,
                type: params[i],
                mutable: true,
                defined: true,
                used: false,
                declSpan: expr.params[i].span,
                isFunction: false,
                isStruct: false,
            });
        }
        for (const s of expr.body.body)
            this.analyseStmt(s);
        this.warnUnused(child);
        this.scope = prevScope;
        this.currentFunctionReturn = prev;
        this.currentFunctionIsAsync = prevAsync;
        const effectiveRet = expr.isAsync ? (0, types_js_1.makeFuture)(ret) : ret;
        return (0, types_js_1.makeFunction)(params, effectiveRet);
    }
    analyseIfExpr(expr) {
        this.analyseExpr(expr.condition);
        this.analyseBlock(expr.then);
        if (expr.else_) {
            if (expr.else_.kind === "BlockStmt")
                this.analyseBlock(expr.else_);
            else
                this.analyseIfExpr(expr.else_);
        }
        return types_js_1.T_ANY;
    }
    analyseBlockExpr(expr) {
        const child = new scope_js_1.Scope(this.scope);
        const prev = this.scope;
        this.scope = child;
        let lastType = types_js_1.T_NULL;
        for (const s of expr.body) {
            if (s.kind === "ExprStmt") {
                lastType = this.analyseExpr(s.expr);
            }
            else {
                this.analyseStmt(s);
            }
        }
        this.warnUnused(child);
        this.scope = prev;
        return lastType;
    }
    analyseStructInit(expr) {
        const st = this.structs.get(expr.name);
        if (!st) {
            this.reporter.error(index_js_1.ErrorCode.E308, `Undefined struct \`${expr.name}\``, expr.span);
            return types_js_1.T_UNKNOWN;
        }
        if (st.fields.size > 0) {
            for (const field of expr.fields) {
                const fieldType = st.fields.get(field.key);
                if (!fieldType) {
                    this.reporter.error(index_js_1.ErrorCode.E309, `Struct \`${expr.name}\` has no field \`${field.key}\``, field.span);
                }
                this.analyseExpr(field.value);
            }
        }
        else {
            for (const field of expr.fields) {
                this.analyseExpr(field.value);
            }
        }
        return st;
    }
    analyseMatchExpr(expr) {
        const scrutineeType = this.analyseExpr(expr.scrutinee);
        let resultType = types_js_1.T_NEVER;
        let hasWildcard = false;
        if (expr.arms.length === 0) {
            this.reporter.error(index_js_1.ErrorCode.E204, "match expression must have at least one arm", expr.span);
            return types_js_1.T_ANY;
        }
        for (let i = 0; i < expr.arms.length; i++) {
            const arm = expr.arms[i];
            if (hasWildcard) {
                this.reporter.warning(index_js_1.ErrorCode.E301, "Unreachable pattern in match expression", arm.span, { help: ["This arm occurs after an unconditional wildcard pattern and will never execute."] });
            }
            // Check pattern and bind any identifiers in arm's scope
            const armScope = new scope_js_1.Scope(this.scope, false, false);
            const prevScope = this.scope;
            this.scope = armScope;
            this.checkPattern(arm.pattern, scrutineeType, armScope);
            if (arm.pattern.kind === "WildcardPattern" && !arm.guard) {
                hasWildcard = true;
            }
            if (arm.guard) {
                const guardType = this.analyseExpr(arm.guard);
                if (guardType.kind !== "Bool" && guardType.kind !== "Any") {
                    this.typeMismatch(types_js_1.T_BOOL, guardType, arm.guard.span, `Match guard must evaluate to Bool, got \`${(0, types_js_1.typeToString)(guardType)}\``);
                }
            }
            let armBodyType;
            if (arm.body.kind === "BlockStmt") {
                armBodyType = types_js_1.T_NULL;
                for (const stmt of arm.body.body) {
                    if (stmt.kind === "ExprStmt") {
                        armBodyType = this.analyseExpr(stmt.expr);
                    }
                    else {
                        this.analyseStmt(stmt);
                    }
                }
            }
            else {
                armBodyType = this.analyseExpr(arm.body);
            }
            this.scope = prevScope;
            if (resultType.kind === "Never") {
                resultType = armBodyType;
            }
            else if (!(0, types_js_1.typesEqual)(resultType, armBodyType)) {
                if (!(0, types_js_1.isAssignable)(resultType, armBodyType) && !(0, types_js_1.isAssignable)(armBodyType, resultType)) {
                    resultType = types_js_1.T_ANY;
                }
            }
        }
        return resultType;
    }
    checkPattern(pat, targetType, scope) {
        switch (pat.kind) {
            case "WildcardPattern":
                break;
            case "IdentPattern": {
                scope.define({
                    name: pat.name,
                    type: targetType,
                    mutable: false,
                    defined: true,
                    used: false,
                    declSpan: pat.span,
                    isFunction: false,
                    isStruct: false,
                });
                break;
            }
            case "LiteralPattern": {
                const litType = this.analyseExpr(pat.literal);
                if (targetType.kind !== "Any" && !(0, types_js_1.isAssignable)(targetType, litType) && !(0, types_js_1.isAssignable)(litType, targetType)) {
                    this.typeMismatch(targetType, litType, pat.span, `Pattern type mismatch: expected \`${(0, types_js_1.typeToString)(targetType)}\`, got \`${(0, types_js_1.typeToString)(litType)}\``);
                }
                break;
            }
            case "ArrayPattern": {
                const elemType = targetType.kind === "Array" ? targetType.elementType : types_js_1.T_ANY;
                for (const elem of pat.elements) {
                    this.checkPattern(elem, elemType, scope);
                }
                break;
            }
        }
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    typeMismatch(expected, found, span, contextMessage) {
        const message = contextMessage ??
            `Type mismatch: expected \`${(0, types_js_1.typeToString)(expected)}\`, found \`${(0, types_js_1.typeToString)(found)}\``;
        const label = `expected \`${(0, types_js_1.typeToString)(expected)}\`, found \`${(0, types_js_1.typeToString)(found)}\``;
        const notes = [];
        // Structural diff for structs
        if (expected.kind === "Struct" && found.kind === "Struct") {
            for (const [name, expFieldType] of expected.fields) {
                const foundFieldType = found.fields.get(name);
                if (!foundFieldType) {
                    notes.push(`field \`${name}\` is missing in struct \`${found.name}\``);
                }
                else if (!(0, types_js_1.isAssignable)(expFieldType, foundFieldType)) {
                    notes.push(`field \`${name}\` type mismatch: expected \`${(0, types_js_1.typeToString)(expFieldType)}\`, found \`${(0, types_js_1.typeToString)(foundFieldType)}\``);
                }
            }
            for (const [name] of found.fields) {
                if (!expected.fields.has(name)) {
                    notes.push(`unexpected field \`${name}\` in struct \`${found.name}\``);
                }
            }
        }
        else if (expected.kind === "Array" && found.kind === "Array") {
            if (!(0, types_js_1.isAssignable)(expected.elementType, found.elementType)) {
                notes.push(`array element type mismatch: expected \`${(0, types_js_1.typeToString)(expected.elementType)}\`, found \`${(0, types_js_1.typeToString)(found.elementType)}\``);
            }
        }
        else if (expected.kind === "Function" && found.kind === "Function") {
            if (expected.params.length !== found.params.length) {
                notes.push(`function arity mismatch: expected ${expected.params.length} parameter(s), found ${found.params.length}`);
            }
            else {
                for (let i = 0; i < expected.params.length; i++) {
                    if (!(0, types_js_1.isAssignable)(expected.params[i], found.params[i])) {
                        notes.push(`parameter ${i + 1} type mismatch: expected \`${(0, types_js_1.typeToString)(expected.params[i])}\`, found \`${(0, types_js_1.typeToString)(found.params[i])}\``);
                    }
                }
            }
            if (!(0, types_js_1.isAssignable)(expected.returnType, found.returnType)) {
                notes.push(`return type mismatch: expected \`${(0, types_js_1.typeToString)(expected.returnType)}\`, found \`${(0, types_js_1.typeToString)(found.returnType)}\``);
            }
        }
        else if (expected.kind === "TypeParam" || found.kind === "TypeParam") {
            notes.push(`generic type parameter mismatch: cannot unify \`${(0, types_js_1.typeToString)(expected)}\` with \`${(0, types_js_1.typeToString)(found)}\``);
        }
        this.reporter.error(index_js_1.ErrorCode.E303, message, span, {
            label,
            notes: notes.length > 0 ? notes : undefined,
        });
    }
    typeError(message, span) {
        this.reporter.error(index_js_1.ErrorCode.E303, message, span);
    }
    warnUnused(scope) {
        for (const sym of scope.unusedSymbols()) {
            if (sym.isFunction || sym.isStruct)
                continue; // Don't warn for fn/struct
            this.reporter.warning(index_js_1.ErrorCode.E301, `Variable \`${sym.name}\` is declared but never used`, sym.declSpan, { help: [`If intentional, prefix the name with \`_\`: \`_${sym.name}\``] });
        }
    }
    collectAllNames() {
        const names = [];
        let s = this.scope;
        while (s) {
            for (const sym of s.allSymbols())
                names.push(sym.name);
            s = s.parent;
        }
        return names;
    }
}
exports.SemanticAnalyser = SemanticAnalyser;
// ─── Convenience function ─────────────────────────────────────────────────────
function analyse(program, source, reporter) {
    const rep = reporter ?? new index_js_1.ErrorReporter(source, program.fileName);
    const analyser = new SemanticAnalyser(rep, source);
    analyser.analyse(program);
}
//# sourceMappingURL=analyser.js.map