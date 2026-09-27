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

import * as fs from "node:fs";
import * as path from "node:path";
import * as N from "../ast/nodes.js";
import { visitExpr, visitStmt } from "../ast/visitor.js";
import { ErrorCode, ErrorReporter, SourceSpan } from "../errors/index.js";
import { findClosestMatch } from "../utils/index.js";
import { Scope, createGlobalScope, Symbol } from "./scope.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import {
  HkdType, StructType, FunctionType,
  T_INT, T_FLOAT, T_STRING, T_BOOL, T_NULL,
  T_UNKNOWN, T_ANY, T_NEVER,
  makeArray, makeFunction, makeNullable, makeTypeParam, makeResult, makeFuture,
  typeToString, typesEqual, isAssignable,
} from "./types.js";

// ─── Type annotation resolver ─────────────────────────────────────────────────

function resolveTypeExpr(
  te: N.TypeExpr,
  structs: Map<string, StructType>,
  typeParams?: Set<string>,
  typeParamBounds?: Record<string, string>
): HkdType {
  switch (te.kind) {
    case "NamedType": {
      if (typeParams && typeParams.has(te.name)) {
        const bound = typeParamBounds ? typeParamBounds[te.name] : undefined;
        return makeTypeParam(te.name, bound);
      }
      switch (te.name) {
        case "Int":
        case "int":    return T_INT;
        case "Float":
        case "float":  return T_FLOAT;
        case "String":
        case "string": return T_STRING;
        case "Bool":
        case "bool":   return T_BOOL;
        case "Null":
        case "null":   return T_NULL;
        case "Any":
        case "any":    return T_ANY;
        case "Future":
        case "future": return makeFuture(T_ANY);
        case "Result":
        case "result": return makeResult(T_ANY, T_ANY);
        default: {
          const st = structs.get(te.name);
          return st ?? T_UNKNOWN;
        }
      }
    }
    case "ArrayType":
      return makeArray(resolveTypeExpr(te.elementType, structs, typeParams, typeParamBounds));
    case "FunctionType": {
      const params = te.params.map((p) => resolveTypeExpr(p, structs, typeParams, typeParamBounds));
      const ret = te.returnType ? resolveTypeExpr(te.returnType, structs, typeParams, typeParamBounds) : T_NULL;
      return makeFunction(params, ret);
    }
    case "NullableType":
      return makeNullable(resolveTypeExpr(te.inner, structs, typeParams, typeParamBounds));
  }
}

// ─── Standard Library Symbol Mapping for E301 suggestions ─────────────────────

export const UNIQUE_STDLIB_SYMBOLS: Record<string, string> = {
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

export const AMBIGUOUS_STDLIB_SYMBOLS = new Set([
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

export interface TraitMethodInfo {
  params: HkdType[];
  returnType: HkdType;
  paramNames: string[];
  span: SourceSpan;
}

export interface TraitDef {
  name: string;
  methods: Map<string, TraitMethodInfo>;
  span: SourceSpan;
}

// ─── Analyser class ───────────────────────────────────────────────────────────

export class SemanticAnalyser {
  private scope: Scope;
  private structs: Map<string, StructType> = new Map();
  private structMethods: Map<string, Map<string, FunctionType>> = new Map();
  private traits: Map<string, TraitDef> = new Map();
  private structTraits: Map<string, Set<string>> = new Map();
  private traitImpls: Set<string> = new Set();
  private currentFunctionReturn: HkdType | null = null;
  private currentFunctionIsAsync: boolean = false;
  private importedModules: Set<string> = new Set();
  private loadedImportPaths: Set<string> = new Set();

  constructor(
    private readonly reporter: ErrorReporter,
    private readonly source: string
  ) {
    this.scope = createGlobalScope();
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
    for (const s of ast.statements) {
      if (s.kind === "ImportStmt") {
        this.scanImportedAst(s.source, nextBase);
      }
      const decl = s.kind === "ExportStmt" ? s.declaration : s;
      if (decl.kind === "TraitDeclStmt") {
        if (!this.traits.has(decl.name)) {
          this.hoistTraitDecl(decl);
        }
      } else if (decl.kind === "StructDeclStmt") {
        if (!this.structs.has(decl.name)) {
          const fields = new Map<string, HkdType>();
          for (const f of decl.fields) {
            fields.set(f.name, resolveTypeExpr(f.typeAnnotation, this.structs));
          }
          const st: StructType = { kind: "Struct", name: decl.name, fields };
          this.structs.set(decl.name, st);
        }
      } else if (decl.kind === "ImplBlockStmt") {
        this.hoistImplBlock(decl);
      } else if (decl.kind === "FunctionDeclStmt" && decl.typeParams && decl.typeParams.length > 0) {
        const typeParams = new Set(decl.typeParams);
        const params = decl.params.map((p) =>
          p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, decl.typeParamBounds) : T_ANY
        );
        const ret = decl.returnType
          ? resolveTypeExpr(decl.returnType, this.structs, typeParams, decl.typeParamBounds)
          : T_ANY;
        const fnType = makeFunction(params, ret);
        const sym = this.scope.lookup(decl.name);
        if (sym) {
          sym.type = fnType;
        } else {
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

  analyse(program: N.Program): void {
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

  private hoistDeclarations(stmts: N.Stmt[]): void {
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
        const fields = new Map<string, HkdType>();
        for (const f of decl.fields) {
          fields.set(f.name, resolveTypeExpr(f.typeAnnotation, this.structs));
        }
        const st: StructType = { kind: "Struct", name: decl.name, fields };
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
        const params = decl.params.map((p) =>
          p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, decl.typeParamBounds) : T_ANY
        );
        const rawRet = decl.returnType
          ? resolveTypeExpr(decl.returnType, this.structs, typeParams, decl.typeParamBounds)
          : T_ANY;
        const ret = decl.isAsync ? makeFuture(rawRet) : rawRet;
        this.scope.define({
          name: decl.name,
          type: makeFunction(params, ret),
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

  private hoistTraitDecl(stmt: N.TraitDeclStmt): void {
    if (this.traits.has(stmt.name)) {
      this.reporter.error(
        ErrorCode.E304,
        `Trait \`${stmt.name}\` is already declared in this scope`,
        stmt.span
      );
      return;
    }

    const methods = new Map<string, TraitMethodInfo>();
    for (const m of stmt.methods) {
      if (methods.has(m.name)) {
        this.reporter.error(
          ErrorCode.E304,
          `Method \`${m.name}\` is declared more than once in trait \`${stmt.name}\``,
          m.span
        );
        continue;
      }
      if (m.params.length === 0 || m.params[0].name !== "self") {
        this.reporter.error(
          ErrorCode.E307,
          `First parameter of trait method \`${m.name}\` must be \`self\``,
          m.span
        );
      }
      const params: HkdType[] = [];
      for (let i = 1; i < m.params.length; i++) {
        const p = m.params[i];
        params.push(p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : T_ANY);
      }
      const ret = m.returnType ? resolveTypeExpr(m.returnType, this.structs) : T_ANY;
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

  private hoistImplBlock(stmt: N.ImplBlockStmt): void {
    const st = this.structs.get(stmt.structName);
    if (!st) {
      this.reporter.error(
        ErrorCode.E301,
        `Cannot find struct \`${stmt.structName}\` in scope`,
        stmt.span
      );
      return;
    }

    if (!this.structMethods.has(stmt.structName)) {
      this.structMethods.set(stmt.structName, new Map());
    }
    const methods = this.structMethods.get(stmt.structName)!;

    let trait: TraitDef | null = null;
    if (stmt.traitName) {
      trait = this.traits.get(stmt.traitName) ?? null;
      if (!trait) {
        this.reporter.error(
          ErrorCode.E301,
          `Cannot find trait \`${stmt.traitName}\` in scope`,
          stmt.span
        );
        return;
      }

      const implKey = `${stmt.traitName}#${stmt.structName}`;
      if (this.traitImpls.has(implKey)) {
        this.reporter.error(
          ErrorCode.E304,
          `Duplicate implementation of trait \`${stmt.traitName}\` for struct \`${stmt.structName}\``,
          stmt.span
        );
        return;
      }
      this.traitImpls.add(implKey);

      if (!this.structTraits.has(stmt.structName)) {
        this.structTraits.set(stmt.structName, new Set());
      }
      this.structTraits.get(stmt.structName)!.add(stmt.traitName);

      const implMethodNames = new Set(stmt.methods.map((m) => m.name));
      for (const [reqName, reqMethod] of trait.methods) {
        if (!implMethodNames.has(reqName)) {
          this.reporter.error(
            ErrorCode.E308,
            `Struct \`${stmt.structName}\` does not implement required method \`${reqName}\` of trait \`${stmt.traitName}\``,
            stmt.span,
            { help: [`Implement method \`fn ${reqName}(self, ...)\` in \`impl ${stmt.traitName} for ${stmt.structName}\``] }
          );
        }
      }
    }

    for (const method of stmt.methods) {
      if (st.fields.has(method.name)) {
        this.reporter.error(
          ErrorCode.E304,
          `Method \`${method.name}\` conflicts with existing field \`${method.name}\` on struct \`${stmt.structName}\``,
          method.span
        );
        continue;
      }

      if (methods.has(method.name)) {
        this.reporter.error(
          ErrorCode.E304,
          `Method \`${method.name}\` is already defined for struct \`${stmt.structName}\``,
          method.span
        );
        continue;
      }

      if (method.params.length === 0 || method.params[0].name !== "self") {
        this.reporter.error(
          ErrorCode.E307,
          `First parameter of method \`${method.name}\` must be \`self\``,
          method.span
        );
        continue;
      }

      if (trait) {
        const reqMethod = trait.methods.get(method.name);
        if (reqMethod) {
          if (method.params.length !== reqMethod.params.length + 1) {
            this.reporter.error(
              ErrorCode.E307,
              `Expected ${reqMethod.params.length + 1} parameter(s) for method \`${method.name}\`, got ${method.params.length}`,
              method.span
            );
          }
          for (let i = 1; i < method.params.length && i - 1 < reqMethod.params.length; i++) {
            const actualParam = method.params[i].typeAnnotation
              ? resolveTypeExpr(method.params[i].typeAnnotation!, this.structs)
              : T_ANY;
            const expectedParam = reqMethod.params[i - 1];
            if (
              actualParam.kind !== "Any" &&
              expectedParam.kind !== "Any" &&
              !typesEqual(actualParam, expectedParam)
            ) {
              this.reporter.error(
                ErrorCode.E303,
                `Type mismatch in parameter \`${method.params[i].name}\` of method \`${method.name}\`: expected \`${typeToString(expectedParam)}\`, got \`${typeToString(actualParam)}\``,
                method.params[i].span
              );
            }
          }
          const actualRet = method.returnType
            ? resolveTypeExpr(method.returnType, this.structs)
            : T_ANY;
          if (
            actualRet.kind !== "Any" &&
            reqMethod.returnType.kind !== "Any" &&
            !typesEqual(actualRet, reqMethod.returnType)
          ) {
            this.reporter.error(
              ErrorCode.E303,
              `Type mismatch in return type of method \`${method.name}\`: expected \`${typeToString(reqMethod.returnType)}\`, got \`${typeToString(actualRet)}\``,
              method.span
            );
          }
        }
      }

      const params: HkdType[] = [st];
      for (let i = 1; i < method.params.length; i++) {
        const p = method.params[i];
        params.push(p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : T_ANY);
      }

      const ret = method.returnType
        ? resolveTypeExpr(method.returnType, this.structs)
        : T_ANY;

      const fnType = makeFunction(params, ret);
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

  private analyseStmt(stmt: N.Stmt): void {
    switch (stmt.kind) {
      case "VarDeclStmt":      this.analyseVarDecl(stmt); break;
      case "ConstDeclStmt":    this.analyseConstDecl(stmt); break;
      case "FunctionDeclStmt": this.analyseFunctionDecl(stmt); break;
      case "StructDeclStmt":   /* already hoisted */ break;
      case "ImplBlockStmt":    this.analyseImplBlock(stmt); break;
      case "TraitDeclStmt":    /* already hoisted */ break;
      case "TypeAliasStmt":    break;
      case "ReturnStmt":       this.analyseReturn(stmt); break;
      case "BreakStmt":        this.analyseBreak(stmt); break;
      case "ContinueStmt":     this.analyseContinue(stmt); break;
      case "IfStmt":           this.analyseIfStmt(stmt); break;
      case "WhileStmt":        this.analyseWhile(stmt); break;
      case "ForStmt":          this.analyseFor(stmt); break;
      case "BlockStmt":        this.analyseBlock(stmt); break;
      case "ExprStmt":         this.analyseExpr(stmt.expr); break;
      case "ImportStmt":       this.analyseImport(stmt); break;
      case "ExportStmt":       this.analyseStmt(stmt.declaration); break;
      case "TestStmt":         this.analyseTest(stmt); break;
      case "AssertStmt":       this.analyseAssert(stmt); break;
    }
  }

  private analyseImplBlock(stmt: N.ImplBlockStmt): void {
    const st = this.structs.get(stmt.structName);
    if (!st) return;

    for (const method of stmt.methods) {
      this.analyseMethod(st, method);
    }
  }

  private analyseMethod(st: StructType, method: N.FunctionDeclStmt): void {
    const prevReturn = this.currentFunctionReturn;
    const retType = method.returnType ? resolveTypeExpr(method.returnType, this.structs) : T_ANY;
    this.currentFunctionReturn = retType;

    const fnScope = new Scope(this.scope, true, false);
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
      const pType = p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs) : T_ANY;
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
  private analyseImport(stmt: N.ImportStmt): void {
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
            type: resolvedGlobal?.type ?? T_ANY,
            mutable: false,
            defined: true,
            used: false,
            declSpan: spec.span,
            isFunction: resolvedGlobal?.isFunction ?? true,
            isStruct: resolvedGlobal?.isStruct ?? true,
          });
        } else if (resolvedGlobal && resolvedGlobal.type && resolvedGlobal.type.kind !== "Any") {
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
        type: T_ANY,
        mutable: false,
        defined: true,
        used: false,
        declSpan: stmt.span,
        isFunction: false,
        isStruct: false,
      });
    }
  }
  private analyseVarDecl(stmt: N.VarDeclStmt): void {
    let type: HkdType = T_UNKNOWN;

    if (stmt.initializer) {
      type = this.analyseExpr(stmt.initializer);
    }

    if (stmt.typeAnnotation) {
      const annotated = resolveTypeExpr(stmt.typeAnnotation, this.structs);
      if (stmt.initializer && !isAssignable(annotated, type)) {
        this.typeMismatch(
          annotated,
          type,
          stmt.initializer.span,
          `Cannot assign \`${typeToString(type)}\` to \`${typeToString(annotated)}\``
        );
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
      this.reporter.error(
        ErrorCode.E304,
        `Variable \`${stmt.name}\` is already declared in this scope`,
        stmt.span
      );
    }
  }

  private analyseConstDecl(stmt: N.ConstDeclStmt): void {
    const initType = this.analyseExpr(stmt.initializer);
    let type = initType;

    if (stmt.typeAnnotation) {
      const annotated = resolveTypeExpr(stmt.typeAnnotation, this.structs);
      if (!isAssignable(annotated, initType)) {
        this.typeMismatch(
          annotated,
          initType,
          stmt.initializer.span,
          `Cannot assign \`${typeToString(initType)}\` to \`${typeToString(annotated)}\``
        );
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
      this.reporter.error(
        ErrorCode.E304,
        `\`${stmt.name}\` is already declared in this scope`,
        stmt.span
      );
    }
  }

  private analyseFunctionDecl(stmt: N.FunctionDeclStmt): void {
    const prevReturn = this.currentFunctionReturn;
    const prevAsync = this.currentFunctionIsAsync;
    this.currentFunctionIsAsync = Boolean(stmt.isAsync);
    const typeParams = stmt.typeParams ? new Set(stmt.typeParams) : undefined;
    const retType = stmt.returnType
      ? resolveTypeExpr(stmt.returnType, this.structs, typeParams, stmt.typeParamBounds)
      : T_ANY;

    // Register the function's own name in the enclosing scope so that nested
    // named functions (and recursion) resolve. At top level the name was already
    // hoisted, so define() simply returns false — harmless.
    const effectiveRet = stmt.isAsync ? makeFuture(retType) : retType;
    const fnType = makeFunction(
      stmt.params.map((p) =>
        p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams, stmt.typeParamBounds) : T_ANY
      ),
      effectiveRet
    );
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

    const child = new Scope(this.scope, true, false);
    const prevScope = this.scope;
    this.scope = child;

    // Define parameters in function scope
    for (const param of stmt.params) {
      const paramType = param.typeAnnotation
        ? resolveTypeExpr(param.typeAnnotation, this.structs, typeParams, stmt.typeParamBounds)
        : T_ANY;
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

  private analyseReturn(stmt: N.ReturnStmt): void {
    if (!this.scope.isInsideFunction()) {
      this.reporter.error(
        ErrorCode.E305,
        "`return` outside of function",
        stmt.span,
        { help: ["Move this `return` inside a `fn` body"] }
      );
    }

    if (stmt.value) {
      const t = this.analyseExpr(stmt.value);
      if (
        this.currentFunctionReturn &&
        this.currentFunctionReturn.kind !== "Any" &&
        !isAssignable(this.currentFunctionReturn, t)
      ) {
        this.typeMismatch(
          this.currentFunctionReturn,
          t,
          stmt.value.span,
          `Return type mismatch: expected \`${typeToString(this.currentFunctionReturn)}\`, got \`${typeToString(t)}\``
        );
      }
    }
  }

  private analyseBreak(stmt: N.BreakStmt): void {
    if (!this.scope.isInsideLoop()) {
      this.reporter.error(
        ErrorCode.E306,
        "`break` outside of loop",
        stmt.span
      );
    }
  }

  private analyseContinue(stmt: N.ContinueStmt): void {
    if (!this.scope.isInsideLoop()) {
      this.reporter.error(
        ErrorCode.E306,
        "`continue` outside of loop",
        stmt.span
      );
    }
  }

  private analyseIfStmt(stmt: N.IfStmt): void {
    const condType = this.analyseExpr(stmt.condition);
    if (condType.kind !== "Bool" && condType.kind !== "Any" && condType.kind !== "Unknown") {
      this.typeMismatch(
        T_BOOL,
        condType,
        stmt.condition.span,
        `Condition must be \`Bool\`, found \`${typeToString(condType)}\``
      );
    }
    this.analyseBlock(stmt.then);
    if (stmt.else_) {
      if (stmt.else_.kind === "IfStmt") this.analyseIfStmt(stmt.else_);
      else this.analyseBlock(stmt.else_);
    }
  }

  private analyseWhile(stmt: N.WhileStmt): void {
    this.analyseExpr(stmt.condition);
    const loopScope = new Scope(this.scope, false, true);
    const prev = this.scope;
    this.scope = loopScope;
    for (const s of stmt.body.body) this.analyseStmt(s);
    this.warnUnused(loopScope);
    this.scope = prev;
  }

  private analyseFor(stmt: N.ForStmt): void {
    const iterType = this.analyseExpr(stmt.iterable);
    let elemType: HkdType = T_ANY;
    if (iterType.kind === "Array") {
      elemType = iterType.elementType;
    }

    const loopScope = new Scope(this.scope, false, true);
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

    for (const s of stmt.body.body) this.analyseStmt(s);
    this.warnUnused(loopScope);
    this.scope = prev;
  }

  private analyseBlock(stmt: N.BlockStmt): void {
    const child = new Scope(this.scope);
    const prev = this.scope;
    this.scope = child;
    for (const s of stmt.body) this.analyseStmt(s);
    this.warnUnused(child);
    this.scope = prev;
  }

  private analyseTest(stmt: N.TestStmt): void {
    this.analyseBlock(stmt.body);
  }

  private analyseAssert(stmt: N.AssertStmt): void {
    this.analyseExpr(stmt.condition);
    if (stmt.message) this.analyseExpr(stmt.message);
  }

  // ── Expression analysis ───────────────────────────────────────────────────

  private analyseExpr(expr: N.Expr): HkdType {
    const type = this.analyseExprInternal(expr);
    (expr as any).inferredType = type;
    return type;
  }

  private analyseExprInternal(expr: N.Expr): HkdType {
    switch (expr.kind) {
      case "IntLiteral":    return T_INT;
      case "FloatLiteral":  return T_FLOAT;
      case "StringLiteral": return T_STRING;
      case "BoolLiteral":   return T_BOOL;
      case "NullLiteral":   return T_NULL;

      case "IdentExpr": {
        const sym = this.scope.lookup(expr.name);
        if (!sym) {
          const stdMod = !AMBIGUOUS_STDLIB_SYMBOLS.has(expr.name)
            ? UNIQUE_STDLIB_SYMBOLS[expr.name]
            : undefined;

          if (stdMod) {
            if (this.importedModules.has(stdMod)) {
              this.reporter.error(
                ErrorCode.E301,
                `Undefined variable \`${expr.name}\``,
                expr.span,
                {
                  label: "not found in scope",
                  help: [
                    `\`${expr.name}\` is exported by module \`${stdMod}\`. Use \`${stdMod}.${expr.name}\` to access it.`,
                  ],
                }
              );
            } else {
              this.reporter.error(
                ErrorCode.E301,
                `Undefined variable \`${expr.name}\``,
                expr.span,
                {
                  label: "not found in scope",
                  help: [
                    `\`${expr.name}\` is available from the \`${stdMod}\` standard library module.`,
                    `To use it, add: import ${stdMod}`,
                  ],
                }
              );
            }
          } else {
            const all = this.collectAllNames();
            const suggestion = findClosestMatch(expr.name, all);
            this.reporter.error(
              ErrorCode.E301,
              `Undefined variable \`${expr.name}\``,
              expr.span,
              {
                label: "not found in scope",
                help: suggestion ? [`Did you mean \`${suggestion}\`?`] : undefined,
              }
            );
          }
          return T_UNKNOWN;
        }
        this.scope.markUsed(expr.name);
        return sym.type;
      }

      case "BinaryExpr":   return this.analyseBinary(expr);
      case "UnaryExpr":    return this.analyseUnary(expr);
      case "CallExpr":     return this.analyseCall(expr);
      case "IndexExpr":    return this.analyseIndex(expr);
      case "MemberExpr":   return this.analyseMember(expr);
      case "AssignExpr":   return this.analyseAssign(expr);
      case "CompoundAssignExpr": return this.analyseCompoundAssign(expr);
      case "ArrayExpr":    return this.analyseArray(expr);
      case "ObjectExpr":   return this.analyseObject(expr);
      case "FunctionExpr": return this.analyseFunctionExpr(expr);
      case "IfExpr":       return this.analyseIfExpr(expr);
      case "BlockExpr":    return this.analyseBlockExpr(expr);
      case "StructInitExpr": return this.analyseStructInit(expr);
      case "RangeExpr":    return makeArray(T_INT);
      case "CastExpr":     return resolveTypeExpr(expr.targetType, this.structs);
      case "MatchExpr":    return this.analyseMatchExpr(expr);
      case "AwaitExpr":    return this.analyseAwaitExpr(expr);
    }
  }

  private analyseAwaitExpr(expr: N.AwaitExpr): HkdType {
    if (!this.currentFunctionIsAsync) {
      this.reporter.error(
        ErrorCode.E305,
        "`await` is only allowed inside async functions",
        expr.span,
        { help: ["Add `async` keyword to the enclosing function declaration"] }
      );
    }
    const t = this.analyseExpr(expr.expr);
    if (t.kind === "Future") {
      return t.valueType;
    }
    return t;
  }

  private analyseBinary(expr: N.BinaryExpr): HkdType {
    const left = this.analyseExpr(expr.left);
    const right = this.analyseExpr(expr.right);

    switch (expr.op) {
      case "+":
        if (left.kind === "String" || right.kind === "String") return T_STRING;
        if (left.kind === "Float" || right.kind === "Float") return T_FLOAT;
        return T_INT;
      case "-": case "*": case "/": case "%": case "**":
        if (left.kind === "Float" || right.kind === "Float") return T_FLOAT;
        return T_INT;
      case "==": case "!=": case "<": case "<=": case ">": case ">=":
        return T_BOOL;
      case "&&": case "||":
        return T_BOOL;
      case "&": case "|": case "^": case "<<": case ">>":
        return T_INT;
      default:
        return T_ANY;
    }
  }

  private analyseUnary(expr: N.UnaryExpr): HkdType {
    const t = this.analyseExpr(expr.operand);
    switch (expr.op) {
      case "-": return t.kind === "Float" ? T_FLOAT : T_INT;
      case "!": return T_BOOL;
      case "~": return T_INT;
    }
  }

  private analyseCall(expr: N.CallExpr): HkdType {
    // Struct method invocation
    if (expr.callee.kind === "MemberExpr") {
      const objType = this.analyseExpr(expr.callee.object);
      if (objType.kind === "Struct") {
        const method = this.structMethods.get(objType.name)?.get(expr.callee.property);
        if (method) {
          (expr.callee as any).isMethodCall = true;
          (expr.callee as any).structName = objType.name;
          (expr.callee as any).methodName = expr.callee.property;

          const expectedParams = method.params.slice(1);
          const argTypes = expr.args.map((a) => this.analyseExpr(a));

          if (expr.args.length !== expectedParams.length) {
            this.reporter.error(
              ErrorCode.E307,
              `Method \`${expr.callee.property}\` expects ${expectedParams.length} argument(s), got ${expr.args.length}`,
              expr.span
            );
          } else {
            for (let i = 0; i < expr.args.length; i++) {
              const expected = expectedParams[i];
              const actual = argTypes[i];
              if (
                expected &&
                actual &&
                expected.kind !== "Any" &&
                expected.kind !== "Unknown" &&
                actual.kind !== "Any" &&
                actual.kind !== "Unknown" &&
                !isAssignable(expected, actual)
              ) {
                this.typeMismatch(
                  expected,
                  actual,
                  expr.args[i].span,
                  `Argument ${i + 1} of method \`${expr.callee.property}\` expects \`${typeToString(expected)}\`, got \`${typeToString(actual)}\``
                );
              }
            }
          }
          return method.returnType;
        }
      } else if (objType.kind === "TypeParam") {
        if (!objType.bound) {
          this.reporter.error(
            ErrorCode.E309,
            `Cannot call method \`${expr.callee.property}\` on unconstrained type parameter \`${objType.name}\``,
            expr.callee.span,
            { help: [`Add trait bound: \`<${objType.name}: TraitName>\``] }
          );
          return T_UNKNOWN;
        }

        const trait = this.traits.get(objType.bound);
        if (trait) {
          if (trait.methods.size === 0) {
            // External/imported trait without local definitions
            (expr.callee as any).isTraitCall = true;
            (expr.callee as any).traitName = objType.bound;
            (expr.callee as any).methodName = expr.callee.property;
            for (const a of expr.args) this.analyseExpr(a);
            return T_ANY;
          }
          const reqMethod = trait.methods.get(expr.callee.property);
          if (reqMethod) {
            (expr.callee as any).isTraitCall = true;
            (expr.callee as any).traitName = objType.bound;
            (expr.callee as any).methodName = expr.callee.property;

            const expectedParams = reqMethod.params;
            const argTypes = expr.args.map((a) => this.analyseExpr(a));

            if (expr.args.length !== expectedParams.length) {
              this.reporter.error(
                ErrorCode.E307,
                `Method \`${expr.callee.property}\` of trait \`${objType.bound}\` expects ${expectedParams.length} argument(s), got ${expr.args.length}`,
                expr.span
              );
            }
            return reqMethod.returnType;
          } else {
            this.reporter.error(
              ErrorCode.E309,
              `Trait \`${objType.bound}\` has no method \`${expr.callee.property}\``,
              expr.callee.span
            );
            return T_UNKNOWN;
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
              this.reporter.error(
                ErrorCode.E308,
                `Type \`${argType.name}\` does not implement trait \`${param.bound}\``,
                expr.args[i].span,
                { help: [`Implement \`impl ${param.bound} for ${argType.name} { ... }\``] }
              );
            }
          } else if (argType && argType.kind !== "Any" && argType.kind !== "Unknown" && (argType.kind as any) !== "TypeParam") {
            this.reporter.error(
              ErrorCode.E308,
              `Type \`${typeToString(argType)}\` does not implement trait \`${param.bound}\``,
              expr.args[i].span
            );
          }
        }
      }

      // Record monomorphic specialization for trait-bounded generic call
      if (calleeType.params.some((p) => p.kind === "TypeParam" && p.bound)) {
        const concreteNames: string[] = [];
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
          (expr as any).monomorphizedName = monoName;
          (expr as any).monoArgTypes = argTypes;
        }
      }

      if (
        expr.args.length !== calleeType.params.length &&
        calleeType.params[calleeType.params.length - 1]?.kind !== "Any"
      ) {
        // Allow any-typed params for variadic builtins
        if (!calleeType.params.some((p) => p.kind === "Any")) {
          this.reporter.error(
            ErrorCode.E307,
            `Expected ${calleeType.params.length} argument(s), got ${expr.args.length}`,
            expr.span
          );
        }
      }
      let ret = calleeType.returnType;
      if (ret.kind === "TypeParam") {
        if (expr.typeArgs && expr.typeArgs.length > 0) {
          ret = resolveTypeExpr(expr.typeArgs[0], this.structs);
        } else {
          for (let i = 0; i < calleeType.params.length; i++) {
            if (
              calleeType.params[i].kind === "TypeParam" &&
              (calleeType.params[i] as any).name === ret.name &&
              argTypes[i]
            ) {
              ret = argTypes[i];
              break;
            }
          }
        }
      }
      return ret;
    }

    if (calleeType.kind !== "Any" && calleeType.kind !== "Unknown") {
      this.reporter.error(
        ErrorCode.E408,
        `\`${typeToString(calleeType)}\` is not callable`,
        expr.callee.span
      );
    }

    return T_ANY;
  }

  private analyseIndex(expr: N.IndexExpr): HkdType {
    const objType = this.analyseExpr(expr.object);
    this.analyseExpr(expr.index);

    if (objType.kind === "Array") return objType.elementType;
    if (objType.kind === "String") return T_STRING;
    return T_ANY;
  }

  private analyseMember(expr: N.MemberExpr): HkdType {
    const objType = this.analyseExpr(expr.object);
    if (objType.kind === "Struct") {
      if (objType.fields.size === 0 && !this.structMethods.has(objType.name)) {
        return T_ANY;
      }
      const fieldType = objType.fields.get(expr.property);
      if (!fieldType) {
        const method = this.structMethods.get(objType.name)?.get(expr.property);
        if (method) {
          return method;
        }
        const available = [
          ...Array.from(objType.fields.keys()),
          ...(this.structMethods.get(objType.name) ? Array.from(this.structMethods.get(objType.name)!.keys()) : []),
        ];
        this.reporter.error(
          ErrorCode.E309,
          `Struct \`${objType.name}\` has no field or method \`${expr.property}\``,
          expr.span,
          {
            help: [
              `Available: ${available.join(", ")}`,
            ],
          }
        );
        return T_UNKNOWN;
      }
      return fieldType;
    }

    if (objType.kind === "TypeParam") {
      if (!objType.bound) {
        this.reporter.error(
          ErrorCode.E309,
          `Cannot access member \`${expr.property}\` on unconstrained type parameter \`${objType.name}\``,
          expr.span,
          { help: [`Add trait bound: \`<${objType.name}: TraitName>\``] }
        );
        return T_UNKNOWN;
      }
      const trait = this.traits.get(objType.bound);
      if (trait) {
        if (trait.methods.size === 0) {
          return T_ANY;
        }
        const m = trait.methods.get(expr.property);
        if (m) {
          return makeFunction([objType, ...m.params], m.returnType);
        }
        this.reporter.error(
          ErrorCode.E309,
          `Trait \`${objType.bound}\` has no method \`${expr.property}\``,
          expr.span,
          { help: [`Available methods on \`${objType.bound}\`: ${Array.from(trait.methods.keys()).join(", ")}`] }
        );
        return T_UNKNOWN;
      }
    }
    return T_ANY;
  }

  private analyseAssign(expr: N.AssignExpr): HkdType {
    const targetType = this.analyseExpr(expr.target);
    const valueType = this.analyseExpr(expr.value);

    // Check mutability for IdentExpr
    if (expr.target.kind === "IdentExpr") {
      if (expr.target.name === "self") {
        this.reporter.error(
          ErrorCode.E405,
          "Cannot assign to `self` — method receiver is immutable",
          expr.span
        );
      }
      const sym = this.scope.lookup(expr.target.name);
      if (sym && !sym.mutable) {
        this.reporter.error(
          ErrorCode.E405,
          `Cannot assign to \`${expr.target.name}\` — it is declared \`const\``,
          expr.span,
          { help: ["Change `const` to `let` if you need to reassign"] }
        );
      }
      if (sym && (sym.type.kind === "Unknown" || sym.type.kind === "Null")) {
        sym.type = valueType;
      }
    }

    if (
      targetType.kind !== "Unknown" &&
      targetType.kind !== "Any" &&
      targetType.kind !== "Null" &&
      valueType.kind !== "Unknown" &&
      valueType.kind !== "Any" &&
      !isAssignable(targetType, valueType)
    ) {
      this.typeMismatch(
        targetType,
        valueType,
        expr.value.span,
        `Cannot assign \`${typeToString(valueType)}\` to \`${typeToString(targetType)}\``
      );
    }

    return valueType;
  }

  private analyseCompoundAssign(expr: N.CompoundAssignExpr): HkdType {
    if (expr.target.kind === "IdentExpr" && expr.target.name === "self") {
      this.reporter.error(
        ErrorCode.E405,
        "Cannot assign to `self` — method receiver is immutable",
        expr.span
      );
    }
    const targetType = this.analyseExpr(expr.target);
    const valueType = this.analyseExpr(expr.value);

    if (expr.target.kind === "IdentExpr") {
      const sym = this.scope.lookup(expr.target.name);
      if (sym && !sym.mutable) {
        this.reporter.error(
          ErrorCode.E405,
          `Cannot assign to \`${expr.target.name}\` — it is declared \`const\``,
          expr.span,
          { help: ["Change `const` to `let` if you need to reassign"] }
        );
      }
    }

    if (
      targetType.kind !== "Unknown" &&
      targetType.kind !== "Any" &&
      valueType.kind !== "Unknown" &&
      valueType.kind !== "Any" &&
      !isAssignable(targetType, valueType)
    ) {
      this.typeMismatch(
        targetType,
        valueType,
        expr.value.span,
        `Cannot apply compound assignment \`${expr.op}\` with \`${typeToString(valueType)}\` to \`${typeToString(targetType)}\``
      );
    }

    return targetType;
  }

  private analyseArray(expr: N.ArrayExpr): HkdType {
    if (expr.elements.length === 0) return makeArray(T_UNKNOWN);
    const firstType = this.analyseExpr(expr.elements[0]);
    for (let i = 1; i < expr.elements.length; i++) {
      this.analyseExpr(expr.elements[i]);
    }
    return makeArray(firstType);
  }

  private analyseObject(expr: N.ObjectExpr): HkdType {
    for (const field of expr.fields) {
      this.analyseExpr(field.value);
    }
    return T_ANY;
  }

  private analyseFunctionExpr(expr: N.FunctionExpr): HkdType {
    const typeParams = expr.typeParams ? new Set(expr.typeParams) : undefined;
    const params = expr.params.map((p) =>
      p.typeAnnotation ? resolveTypeExpr(p.typeAnnotation, this.structs, typeParams) : T_ANY
    );
    const ret = expr.returnType
      ? resolveTypeExpr(expr.returnType, this.structs, typeParams)
      : T_ANY;

    const prev = this.currentFunctionReturn;
    const prevAsync = this.currentFunctionIsAsync;
    this.currentFunctionIsAsync = Boolean(expr.isAsync);
    this.currentFunctionReturn = ret;
    const child = new Scope(this.scope, true, false);
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

    for (const s of expr.body.body) this.analyseStmt(s);
    this.warnUnused(child);

    this.scope = prevScope;
    this.currentFunctionReturn = prev;
    this.currentFunctionIsAsync = prevAsync;

    const effectiveRet = expr.isAsync ? makeFuture(ret) : ret;
    return makeFunction(params, effectiveRet);
  }

  private analyseIfExpr(expr: N.IfExpr): HkdType {
    this.analyseExpr(expr.condition);
    this.analyseBlock(expr.then);
    if (expr.else_) {
      if (expr.else_.kind === "BlockStmt") this.analyseBlock(expr.else_);
      else this.analyseIfExpr(expr.else_);
    }
    return T_ANY;
  }

  private analyseBlockExpr(expr: N.BlockExpr): HkdType {
    const child = new Scope(this.scope);
    const prev = this.scope;
    this.scope = child;
    let lastType: HkdType = T_NULL;
    for (const s of expr.body) {
      if (s.kind === "ExprStmt") {
        lastType = this.analyseExpr(s.expr);
      } else {
        this.analyseStmt(s);
      }
    }
    this.warnUnused(child);
    this.scope = prev;
    return lastType;
  }

  private analyseStructInit(expr: N.StructInitExpr): HkdType {
    const st = this.structs.get(expr.name);
    if (!st) {
      this.reporter.error(
        ErrorCode.E308,
        `Undefined struct \`${expr.name}\``,
        expr.span
      );
      return T_UNKNOWN;
    }

    if (st.fields.size > 0) {
      for (const field of expr.fields) {
        const fieldType = st.fields.get(field.key);
        if (!fieldType) {
          this.reporter.error(
            ErrorCode.E309,
            `Struct \`${expr.name}\` has no field \`${field.key}\``,
            field.span
          );
        }
        this.analyseExpr(field.value);
      }
    } else {
      for (const field of expr.fields) {
        this.analyseExpr(field.value);
      }
    }

    return st;
  }

  private analyseMatchExpr(expr: N.MatchExpr): HkdType {
    const scrutineeType = this.analyseExpr(expr.scrutinee);
    let resultType: HkdType = T_NEVER;
    let hasWildcard = false;

    if (expr.arms.length === 0) {
      this.reporter.error(
        ErrorCode.E204,
        "match expression must have at least one arm",
        expr.span
      );
      return T_ANY;
    }

    for (let i = 0; i < expr.arms.length; i++) {
      const arm = expr.arms[i];
      if (hasWildcard) {
        this.reporter.warning(
          ErrorCode.E301,
          "Unreachable pattern in match expression",
          arm.span,
          { help: ["This arm occurs after an unconditional wildcard pattern and will never execute."] }
        );
      }

      // Check pattern and bind any identifiers in arm's scope
      const armScope = new Scope(this.scope, false, false);
      const prevScope = this.scope;
      this.scope = armScope;

      this.checkPattern(arm.pattern, scrutineeType, armScope);
      if (arm.pattern.kind === "WildcardPattern" && !arm.guard) {
        hasWildcard = true;
      }

      if (arm.guard) {
        const guardType = this.analyseExpr(arm.guard);
        if (guardType.kind !== "Bool" && guardType.kind !== "Any") {
          this.typeMismatch(
            T_BOOL,
            guardType,
            arm.guard.span,
            `Match guard must evaluate to Bool, got \`${typeToString(guardType)}\``
          );
        }
      }

      let armBodyType: HkdType;
      if (arm.body.kind === "BlockStmt") {
        armBodyType = T_NULL;
        for (const stmt of arm.body.body) {
          if (stmt.kind === "ExprStmt") {
            armBodyType = this.analyseExpr(stmt.expr);
          } else {
            this.analyseStmt(stmt);
          }
        }
      } else {
        armBodyType = this.analyseExpr(arm.body);
      }

      this.scope = prevScope;

      if (resultType.kind === "Never") {
        resultType = armBodyType;
      } else if (!typesEqual(resultType, armBodyType)) {
        if (!isAssignable(resultType, armBodyType) && !isAssignable(armBodyType, resultType)) {
          resultType = T_ANY;
        }
      }
    }

    return resultType;
  }

  private checkPattern(pat: N.Pattern, targetType: HkdType, scope: Scope): void {
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
        if (targetType.kind !== "Any" && !isAssignable(targetType, litType) && !isAssignable(litType, targetType)) {
          this.typeMismatch(
            targetType,
            litType,
            pat.span,
            `Pattern type mismatch: expected \`${typeToString(targetType)}\`, got \`${typeToString(litType)}\``
          );
        }
        break;
      }
      case "ArrayPattern": {
        const elemType = targetType.kind === "Array" ? targetType.elementType : T_ANY;
        for (const elem of pat.elements) {
          this.checkPattern(elem, elemType, scope);
        }
        break;
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private typeMismatch(
    expected: HkdType,
    found: HkdType,
    span: SourceSpan,
    contextMessage?: string
  ): void {
    const message =
      contextMessage ??
      `Type mismatch: expected \`${typeToString(expected)}\`, found \`${typeToString(found)}\``;
    const label = `expected \`${typeToString(expected)}\`, found \`${typeToString(found)}\``;
    const notes: string[] = [];

    // Structural diff for structs
    if (expected.kind === "Struct" && found.kind === "Struct") {
      for (const [name, expFieldType] of expected.fields) {
        const foundFieldType = found.fields.get(name);
        if (!foundFieldType) {
          notes.push(`field \`${name}\` is missing in struct \`${found.name}\``);
        } else if (!isAssignable(expFieldType, foundFieldType)) {
          notes.push(
            `field \`${name}\` type mismatch: expected \`${typeToString(expFieldType)}\`, found \`${typeToString(foundFieldType)}\``
          );
        }
      }
      for (const [name] of found.fields) {
        if (!expected.fields.has(name)) {
          notes.push(`unexpected field \`${name}\` in struct \`${found.name}\``);
        }
      }
    } else if (expected.kind === "Array" && found.kind === "Array") {
      if (!isAssignable(expected.elementType, found.elementType)) {
        notes.push(
          `array element type mismatch: expected \`${typeToString(expected.elementType)}\`, found \`${typeToString(found.elementType)}\``
        );
      }
    } else if (expected.kind === "Function" && found.kind === "Function") {
      if (expected.params.length !== found.params.length) {
        notes.push(
          `function arity mismatch: expected ${expected.params.length} parameter(s), found ${found.params.length}`
        );
      } else {
        for (let i = 0; i < expected.params.length; i++) {
          if (!isAssignable(expected.params[i], found.params[i])) {
            notes.push(
              `parameter ${i + 1} type mismatch: expected \`${typeToString(expected.params[i])}\`, found \`${typeToString(found.params[i])}\``
            );
          }
        }
      }
      if (!isAssignable(expected.returnType, found.returnType)) {
        notes.push(
          `return type mismatch: expected \`${typeToString(expected.returnType)}\`, found \`${typeToString(found.returnType)}\``
        );
      }
    } else if (expected.kind === "TypeParam" || found.kind === "TypeParam") {
      notes.push(
        `generic type parameter mismatch: cannot unify \`${typeToString(expected)}\` with \`${typeToString(found)}\``
      );
    }

    this.reporter.error(ErrorCode.E303, message, span, {
      label,
      notes: notes.length > 0 ? notes : undefined,
    });
  }

  private typeError(message: string, span: SourceSpan): void {
    this.reporter.error(ErrorCode.E303, message, span);
  }

  private warnUnused(scope: Scope): void {
    for (const sym of scope.unusedSymbols()) {
      if (sym.isFunction || sym.isStruct) continue; // Don't warn for fn/struct
      this.reporter.warning(
        ErrorCode.E301,
        `Variable \`${sym.name}\` is declared but never used`,
        sym.declSpan,
        { help: [`If intentional, prefix the name with \`_\`: \`_${sym.name}\``] }
      );
    }
  }

  private collectAllNames(): string[] {
    const names: string[] = [];
    let s: Scope | null = this.scope;
    while (s) {
      for (const sym of s.allSymbols()) names.push(sym.name);
      s = s.parent;
    }
    return names;
  }
}

// ─── Convenience function ─────────────────────────────────────────────────────

export function analyse(
  program: N.Program,
  source: string,
  reporter?: ErrorReporter
): void {
  const rep = reporter ?? new ErrorReporter(source, program.fileName);
  const analyser = new SemanticAnalyser(rep, source);
  analyser.analyse(program);
}
