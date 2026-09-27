/**
 * HKD Parser
 *
 * Converts a flat token stream into a typed AST.
 *
 * Architecture:
 *   - Recursive descent for statements
 *   - Pratt (top-down operator precedence) for expressions
 *   - Automatic semicolon insertion via newline tokens
 *   - Full source-location tracking on every node
 *   - Error recovery: skip to next statement on parse error
 */

import {
  ErrorCode,
  ErrorReporter,
  SourceSpan,
  SourceLocation,
} from "../errors/index.js";
import { Token, TokenKind } from "../lexer/token.js";
import * as N from "../ast/nodes.js";

// ─── Operator precedence levels ──────────────────────────────────────────────

const enum Prec {
  None       = 0,
  Assignment = 1,   // =  +=  -=  *=  /=  %=
  LogicalOr  = 2,   // ||
  LogicalAnd = 3,   // &&
  BitwiseOr  = 4,   // |
  BitwiseXor = 5,   // ^
  BitwiseAnd = 6,   // &
  Equality   = 7,   // ==  !=
  Comparison = 8,   // <  <=  >  >=
  Shift      = 9,   // <<  >>
  Additive   = 10,  // +  -
  Multiplicative = 11, // *  /  %
  Exponent   = 12,  // ** (right-associative)
  Unary      = 13,  // -x  !x  ~x
  Call       = 14,  // f()  x.y  x[i]
  Primary    = 15,
}

// ─── Parser class ─────────────────────────────────────────────────────────────

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private readonly reporter: ErrorReporter;
  private readonly source: string;
  private readonly fileName: string;
  private lastErrorPos: number = -1;
  private readonly edition: "2026" | "2027";
  private readonly enabledFeatures: Set<string> = new Set();

  constructor(
    tokens: Token[],
    source: string,
    fileName: string,
    reporter: ErrorReporter,
    edition: "2026" | "2027" = "2026"
  ) {
    // Filter out newlines initially; we use them only for ASI
    this.tokens = tokens;
    this.source = source;
    this.fileName = fileName;
    this.reporter = reporter;
    this.edition = edition;
    if (edition === "2027") {
      this.enabledFeatures.add("all");
      this.enabledFeatures.add("generics");
      this.enabledFeatures.add("pattern_matching");
      this.enabledFeatures.add("traits");
      this.enabledFeatures.add("result");
      this.enabledFeatures.add("async");
    }
  }

  isFeatureEnabled(name: string): boolean {
    return (
      this.edition === "2027" ||
      this.enabledFeatures.has(name) ||
      this.enabledFeatures.has("all")
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  parse(): N.Program {
    const start = this.startSpan();
    const statements: N.Stmt[] = [];

    this.skipNewlines();

    // Parse any top-level feature directives (#feature(...) or #![feature(...)])
    while (this.check(TokenKind.Hash)) {
      this.parseFeatureDirective();
      this.skipStatementTerminators();
      this.skipNewlines();
    }

    while (!this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) statements.push(stmt);
        this.skipStatementTerminators();
      } catch (e) {
        if (e instanceof ParseError) {
          this.synchronize();
        } else {
          throw e;
        }
      }
    }

    return {
      kind: "Program",
      statements,
      fileName: this.fileName,
      features: Array.from(this.enabledFeatures),
      edition: this.edition,
      span: this.endSpan(start),
    };
  }

  private parseFeatureDirective(): void {
    this.advance(); // #
    if (this.check(TokenKind.Bang)) {
      this.advance(); // !
      this.expect(TokenKind.LBracket, "`[`");
      const ident = this.expectIdent("directive name");
      if (ident === "feature") {
        this.expect(TokenKind.LParen, "`(`");
        const feat = this.expectIdent("feature name");
        this.enabledFeatures.add(feat);
        this.expect(TokenKind.RParen, "`)`");
      }
      this.expect(TokenKind.RBracket, "`]`");
      return;
    }

    const ident = this.expectIdent("directive name");
    if (ident === "feature") {
      this.expect(TokenKind.LParen, "`(`");
      const feat = this.expectIdent("feature name");
      this.enabledFeatures.add(feat);
      this.expect(TokenKind.RParen, "`)`");
    }
  }

  // ── Statement parsing ─────────────────────────────────────────────────────

  private parseStatement(): N.Stmt {
    this.skipNewlines();

    const tok = this.peek();

    switch (tok.kind) {
      case TokenKind.Let:       return this.parseVarDecl(true);
      case TokenKind.Const:     return this.parseVarDecl(false);
      case TokenKind.Fn:        return this.parseFunctionDecl(false);
      case TokenKind.Struct:    return this.parseStructDecl(false);
      case TokenKind.Impl:      return this.parseImpl();
      case TokenKind.Trait:     return this.parseTraitDecl(false);
      case TokenKind.Type:      return this.parseTypeAlias(false);
      case TokenKind.Return:    return this.parseReturn();
      case TokenKind.Break:     return this.parseBreak();
      case TokenKind.Continue:  return this.parseContinue();
      case TokenKind.If:        return this.parseIfStmt();
      case TokenKind.While:     return this.parseWhile();
      case TokenKind.For:       return this.parseFor();
      case TokenKind.LBrace:    return this.parseBlock();
      case TokenKind.Import:    return this.parseImport();
      case TokenKind.Export:    return this.parseExport();
      case TokenKind.Test:      return this.parseTest();
      case TokenKind.Assert:    return this.parseAssertStmt();
      case TokenKind.Async: {
        if (this.peekAt(1)?.kind === TokenKind.Fn) {
          return this.parseFunctionDecl(false, true);
        }
        return this.parseExprStmt();
      }
      default:                  return this.parseExprStmt();
    }
  }

  // let / const declaration
  private parseVarDecl(mutable: boolean): N.VarDeclStmt | N.ConstDeclStmt {
    const start = this.startSpan();
    this.advance(); // consume let / const

    const name = this.expectIdent("variable name");

    let typeAnnotation: N.TypeExpr | null = null;
    if (this.check(TokenKind.Colon)) {
      this.advance();
      typeAnnotation = this.parseTypeExpr();
    }

    let initializer: N.Expr | null = null;
    if (this.check(TokenKind.Eq)) {
      this.advance();
      initializer = this.parseExpr();
    }

    if (mutable) {
      return {
        kind: "VarDeclStmt",
        name,
        typeAnnotation,
        initializer,
        mutable: true,
        span: this.endSpan(start),
      };
    } else {
      if (!initializer) {
        this.error(ErrorCode.E202, "const declaration requires an initializer", start);
      }
      return {
        kind: "ConstDeclStmt",
        name,
        typeAnnotation,
        initializer: initializer!,
        mutable: false,
        span: this.endSpan(start),
      };
    }
  }

  // async? fn name<T, U>(params) -> ReturnType { body }
  private parseFunctionDecl(exported: boolean, isAsync: boolean = false): N.FunctionDeclStmt {
    const start = this.startSpan();
    if (isAsync) {
      const asyncTok = this.expect(TokenKind.Async, "`async`");
      if (!this.isFeatureEnabled("async")) {
        this.error(
          ErrorCode.E201,
          "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`",
          asyncTok.span.start,
          { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
        );
      }
    }
    this.expect(TokenKind.Fn, "`fn`");

    const name = this.expectIdent("function name");
    let typeParams: string[] | undefined;
    let typeParamBounds: Record<string, string> | undefined;
    if (this.check(TokenKind.Lt)) {
      const tp = this.parseTypeParams();
      typeParams = tp.typeParams;
      typeParamBounds = tp.typeParamBounds;
    }
    const params = this.parseParams();

    let returnType: N.TypeExpr | null = null;
    if (this.check(TokenKind.Arrow)) {
      this.advance();
      returnType = this.parseTypeExpr();
    }

    this.skipNewlines();
    const body = this.parseBlock();

    return {
      kind: "FunctionDeclStmt",
      name,
      isAsync,
      typeParams,
      typeParamBounds,
      params,
      returnType,
      body,
      exported,
      span: this.endSpan(start),
    };
  }

  private parseTypeParams(): { typeParams: string[]; typeParamBounds?: Record<string, string> } {
    const startTok = this.advance(); // consume '<'
    if (!this.isFeatureEnabled("generics")) {
      this.reporter.error(
        ErrorCode.E201,
        "Generic functions are an experimental feature in HKD. Enable with `#feature(generics)` or set `edition = \"2027\"` in hkd.toml",
        startTok.span,
        { help: ["Add `#feature(generics)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
      );
    }
    const typeParams: string[] = [];
    const typeParamBounds: Record<string, string> = {};
    let hasBounds = false;

    while (!this.check(TokenKind.Gt) && !this.isAtEnd()) {
      const name = this.expectIdent("type parameter name");
      typeParams.push(name);
      if (this.check(TokenKind.Colon)) {
        this.advance(); // consume ':'
        if (!this.isFeatureEnabled("traits")) {
          this.reporter.error(
            ErrorCode.E201,
            "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml",
            this.peek().span,
            { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
          );
        }
        const bound = this.expectIdent("trait constraint name");
        typeParamBounds[name] = bound;
        hasBounds = true;
      }
      if (!this.check(TokenKind.Gt)) {
        this.expect(TokenKind.Comma, "`,` or `>`");
      }
    }
    this.expect(TokenKind.Gt, "`>`");
    return {
      typeParams,
      typeParamBounds: hasBounds ? typeParamBounds : undefined,
    };
  }

  private parseParams(): N.Param[] {
    this.expect(TokenKind.LParen, "`(`");
    const params: N.Param[] = [];

    while (!this.check(TokenKind.RParen) && !this.isAtEnd()) {
      const pStart = this.startSpan();
      let name: string;
      if (this.check(TokenKind.Self)) {
        name = this.advance().value;
      } else {
        name = this.expectIdent("parameter name");
      }

      let typeAnnotation: N.TypeExpr | null = null;
      if (this.check(TokenKind.Colon)) {
        this.advance();
        typeAnnotation = this.parseTypeExpr();
      }

      let defaultValue: N.Expr | null = null;
      if (this.check(TokenKind.Eq)) {
        this.advance();
        defaultValue = this.parseExpr();
      }

      params.push({
        name,
        typeAnnotation,
        defaultValue,
        span: this.endSpan(pStart),
      });

      if (!this.check(TokenKind.RParen)) {
        this.expect(TokenKind.Comma, "`,` or `)`");
      }
    }

    this.expect(TokenKind.RParen, "`)`");
    return params;
  }

  // struct Name { field: Type, ... }
  private parseStructDecl(exported: boolean): N.StructDeclStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Struct, "`struct`");
    const name = this.expectIdent("struct name");

    this.skipNewlines();
    this.expect(TokenKind.LBrace, "`{`");
    this.skipNewlines();

    const fields: N.StructField[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const fStart = this.startSpan();
      const fname = this.expectIdent("field name");
      this.expect(TokenKind.Colon, "`:`");
      const typeAnnotation = this.parseTypeExpr();

      let defaultValue: N.Expr | null = null;
      if (this.check(TokenKind.Eq)) {
        this.advance();
        defaultValue = this.parseExpr();
      }

      fields.push({
        name: fname,
        typeAnnotation,
        defaultValue,
        span: this.endSpan(fStart),
      });

      if (this.check(TokenKind.Comma)) {
        this.advance();
      }
      this.skipStatementTerminators();
    }

    this.expect(TokenKind.RBrace, "`}`");

    return {
      kind: "StructDeclStmt",
      name,
      fields,
      exported,
      span: this.endSpan(start),
    };
  }

  // impl StructName { ... } or impl TraitName for StructName { ... }
  private parseImpl(): N.ImplBlockStmt {
    const start = this.startSpan();
    const implTok = this.expect(TokenKind.Impl, "`impl`");
    const firstName = this.expectIdent("struct or trait name");

    let traitName: string | undefined = undefined;
    let structName = firstName;

    this.skipNewlines();
    if (this.check(TokenKind.For)) {
      this.advance(); // consume 'for'
      if (!this.isFeatureEnabled("traits")) {
        this.reporter.error(
          ErrorCode.E201,
          "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml",
          implTok.span,
          { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
        );
      }
      traitName = firstName;
      structName = this.expectIdent("struct name");
    }

    this.skipNewlines();
    this.expect(TokenKind.LBrace, "`{`");
    this.skipNewlines();

    const methods: N.FunctionDeclStmt[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenKind.RBrace)) break;
      if (this.check(TokenKind.Fn)) {
        methods.push(this.parseFunctionDecl(false));
      } else {
        this.error(
          ErrorCode.E201,
          `Expected method declaration inside impl block, got \`${this.peek().value}\``,
          this.peek().span
        );
        this.advance();
      }
      this.skipStatementTerminators();
    }

    this.expect(TokenKind.RBrace, "`}`");

    return {
      kind: "ImplBlockStmt",
      traitName,
      structName,
      methods,
      span: this.endSpan(start),
    };
  }

  // trait TraitName { fn method(self, ...) -> ReturnType; ... }
  private parseTraitDecl(exported: boolean): N.TraitDeclStmt {
    const start = this.startSpan();
    const traitTok = this.expect(TokenKind.Trait, "`trait`");
    if (!this.isFeatureEnabled("traits")) {
      this.reporter.error(
        ErrorCode.E201,
        "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml",
        traitTok.span,
        { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
      );
    }
    const name = this.expectIdent("trait name");
    this.skipNewlines();
    this.expect(TokenKind.LBrace, "`{`");
    this.skipNewlines();

    const methods: N.TraitMethodDecl[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      this.skipNewlines();
      if (this.check(TokenKind.RBrace)) break;
      const mStart = this.startSpan();
      this.expect(TokenKind.Fn, "`fn`");
      const methodName = this.expectIdent("method name");
      const params = this.parseParams();
      let returnType: N.TypeExpr | null = null;
      if (this.check(TokenKind.Arrow)) {
        this.advance();
        returnType = this.parseTypeExpr();
      }
      this.skipStatementTerminators();
      methods.push({
        kind: "TraitMethodDecl",
        name: methodName,
        params,
        returnType,
        span: this.endSpan(mStart),
      });
    }

    this.expect(TokenKind.RBrace, "`}`");
    return {
      kind: "TraitDeclStmt",
      name,
      methods,
      exported,
      span: this.endSpan(start),
    };
  }

  // type Alias = TypeExpr
  private parseTypeAlias(exported: boolean): N.TypeAliasStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Type, "`type`");
    const name = this.expectIdent("type name");
    this.expect(TokenKind.Eq, "`=`");
    const typeExpr = this.parseTypeExpr();

    return {
      kind: "TypeAliasStmt",
      name,
      typeExpr,
      exported,
      span: this.endSpan(start),
    };
  }

  // return expr?
  private parseReturn(): N.ReturnStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Return, "`return`");

    let value: N.Expr | null = null;
    if (!this.checkAny(TokenKind.Newline, TokenKind.Semicolon, TokenKind.RBrace, TokenKind.Eof)) {
      value = this.parseExpr();
    }

    return { kind: "ReturnStmt", value, span: this.endSpan(start) };
  }

  // break
  private parseBreak(): N.BreakStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Break, "`break`");
    return { kind: "BreakStmt", span: this.endSpan(start) };
  }

  // continue
  private parseContinue(): N.ContinueStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Continue, "`continue`");
    return { kind: "ContinueStmt", span: this.endSpan(start) };
  }

  // if condition { ... } else { ... }
  private parseIfStmt(): N.IfStmt {
    const start = this.startSpan();
    this.expect(TokenKind.If, "`if`");
    const condition = this.parseExpr();
    this.skipNewlines();
    const then = this.parseBlock();

    let else_: N.BlockStmt | N.IfStmt | null = null;
    this.skipNewlines();
    if (this.check(TokenKind.Else)) {
      this.advance();
      this.skipNewlines();
      if (this.check(TokenKind.If)) {
        else_ = this.parseIfStmt();
      } else {
        else_ = this.parseBlock();
      }
    }

    return { kind: "IfStmt", condition, then, else_, span: this.endSpan(start) };
  }

  // while condition { ... }
  private parseWhile(): N.WhileStmt {
    const start = this.startSpan();
    this.expect(TokenKind.While, "`while`");
    const condition = this.parseExpr();
    this.skipNewlines();
    const body = this.parseBlock();
    return { kind: "WhileStmt", condition, body, span: this.endSpan(start) };
  }

  // for variable in iterable { ... }
  private parseFor(): N.ForStmt {
    const start = this.startSpan();
    this.expect(TokenKind.For, "`for`");
    const variable = this.expectIdent("loop variable");
    this.expect(TokenKind.In, "`in`");
    const iterable = this.parseExpr();
    this.skipNewlines();
    const body = this.parseBlock();
    return { kind: "ForStmt", variable, iterable, body, span: this.endSpan(start) };
  }

  // { stmts... }
  private parseBlock(): N.BlockStmt {
    const start = this.startSpan();
    this.expect(TokenKind.LBrace, "`{`");
    this.skipNewlines();

    const body: N.Stmt[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
        this.skipStatementTerminators();
      } catch (e) {
        if (e instanceof ParseError) {
          this.synchronize();
          if (this.check(TokenKind.RBrace)) break;
        } else {
          throw e;
        }
      }
    }

    this.expect(TokenKind.RBrace, "`}`");
    return { kind: "BlockStmt", body, span: this.endSpan(start) };
  }

  // import math
  // import { add } from "math"
  // import math from "std.math"
  private parseImport(): N.ImportStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Import, "`import`");

    let defaultName: string | null = null;
    let specifiers: N.ImportSpecifier[] = [];
    let source = "";

    if (this.check(TokenKind.LBrace)) {
      // import { add, sub } from "math"
      specifiers = this.parseImportSpecifiers();
      this.expect(TokenKind.From, "`from`");
      source = this.parseStringLiteralValue();
    } else if (this.check(TokenKind.Ident)) {
      defaultName = this.advance().value;
      if (this.check(TokenKind.From)) {
        // import math from "std.math"
        this.advance();
        source = this.parseStringLiteralValue();
      } else {
        // import math  (bare import — module name is the path)
        source = defaultName;
      }
    } else {
      this.error(ErrorCode.E201, "Expected module name or `{` after `import`", start);
      source = "";
    }

    return {
      kind: "ImportStmt",
      specifiers,
      source,
      defaultName,
      span: this.endSpan(start),
    };
  }

  private parseImportSpecifiers(): N.ImportSpecifier[] {
    this.expect(TokenKind.LBrace, "`{`");
    const specifiers: N.ImportSpecifier[] = [];

    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const sStart = this.startSpan();
      const name = this.expectIdent("export name");
      let alias: string | null = null;
      if (this.check(TokenKind.As)) {
        this.advance();
        alias = this.expectIdent("alias");
      }
      specifiers.push({ name, alias, span: this.endSpan(sStart) });
      if (!this.check(TokenKind.RBrace)) {
        this.expect(TokenKind.Comma, "`,` or `}`");
      }
    }

    this.expect(TokenKind.RBrace, "`}`");
    return specifiers;
  }

  private parseStringLiteralValue(): string {
    if (!this.check(TokenKind.String)) {
      this.error(ErrorCode.E202, "Expected string literal", this.startSpan());
      return "";
    }
    return this.advance().value;
  }

  // export fn / let / const / struct / type
  private parseExport(): N.ExportStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Export, "`export`");

    let decl: N.FunctionDeclStmt | N.VarDeclStmt | N.ConstDeclStmt | N.StructDeclStmt | N.TraitDeclStmt | N.TypeAliasStmt;

    const tok = this.peek();
    switch (tok.kind) {
      case TokenKind.Fn:
        decl = this.parseFunctionDecl(true);
        break;
      case TokenKind.Async:
        decl = this.parseFunctionDecl(true, true);
        break;
      case TokenKind.Let:
        decl = this.parseVarDecl(true) as N.VarDeclStmt;
        (decl as N.VarDeclStmt);
        break;
      case TokenKind.Const:
        decl = this.parseVarDecl(false) as N.ConstDeclStmt;
        break;
      case TokenKind.Struct:
        decl = this.parseStructDecl(true);
        break;
      case TokenKind.Trait:
        decl = this.parseTraitDecl(true);
        break;
      case TokenKind.Type:
        decl = this.parseTypeAlias(true);
        break;
      default:
        this.error(ErrorCode.E201, "Expected declaration after `export`", start);
        decl = this.parseFunctionDecl(true); // recovery
    }

    return { kind: "ExportStmt", declaration: decl, span: this.endSpan(start) };
  }

  // test "description" { body }
  private parseTest(): N.TestStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Test, "`test`");

    if (!this.check(TokenKind.String)) {
      this.error(ErrorCode.E202, "Expected test description string", start);
    }

    const description = this.advance().value;
    this.skipNewlines();
    const body = this.parseBlock();

    return { kind: "TestStmt", description, body, span: this.endSpan(start) };
  }

  // assert(condition)  or  assert(condition, "message")
  private parseAssertStmt(): N.AssertStmt {
    const start = this.startSpan();
    this.expect(TokenKind.Assert, "`assert`");
    this.expect(TokenKind.LParen, "`(`");
    const condition = this.parseExpr();

    let message: N.Expr | null = null;
    if (this.check(TokenKind.Comma)) {
      this.advance();
      message = this.parseExpr();
    }

    this.expect(TokenKind.RParen, "`)`");
    return { kind: "AssertStmt", condition, message, span: this.endSpan(start) };
  }

  // expression statement
  private parseExprStmt(): N.ExprStmt {
    const start = this.startSpan();
    const expr = this.parseExpr();
    return { kind: "ExprStmt", expr, span: this.endSpan(start) };
  }

  // ── Type expression parsing ───────────────────────────────────────────────

  private parseTypeExpr(): N.TypeExpr {
    const start = this.startSpan();

    // Array type: [Type]
    if (this.check(TokenKind.LBracket)) {
      this.advance();
      const elementType = this.parseTypeExpr();
      this.expect(TokenKind.RBracket, "`]`");
      return {
        kind: "ArrayType",
        elementType,
        span: this.endSpan(start),
      };
    }

    // Function type: fn(Type, Type) -> Type
    if (this.check(TokenKind.Fn)) {
      this.advance();
      this.expect(TokenKind.LParen, "`(`");
      const params: N.TypeExpr[] = [];
      while (!this.check(TokenKind.RParen) && !this.isAtEnd()) {
        params.push(this.parseTypeExpr());
        if (!this.check(TokenKind.RParen)) {
          this.expect(TokenKind.Comma, "`,` or `)`");
        }
      }
      this.expect(TokenKind.RParen, "`)`");

      let returnType: N.TypeExpr | null = null;
      if (this.check(TokenKind.Arrow)) {
        this.advance();
        returnType = this.parseTypeExpr();
      }

      return {
        kind: "FunctionType",
        params,
        returnType,
        span: this.endSpan(start),
      };
    }

    // Named type (possibly nullable): Int?
    const name = this.expectIdent("type name");
    let typeExpr: N.TypeExpr = { kind: "NamedType", name, span: this.endSpan(start) };

    if (this.check(TokenKind.Question)) {
      this.advance();
      typeExpr = {
        kind: "NullableType",
        inner: typeExpr,
        span: this.endSpan(start),
      };
    }

    return typeExpr;
  }

  // ── Pratt expression parser ───────────────────────────────────────────────

  private parseExpr(minPrec: number = Prec.None): N.Expr {
    let left = this.parseUnary();

    while (true) {
      const tok = this.peekSkippingNewlines();
      const prec = this.infixPrec(tok.kind);
      if (prec <= minPrec) break;

      // Consume any newlines before the infix operator
      this.skipNewlines();
      this.advance(); // consume operator

      left = this.parseInfix(left, tok, prec);
    }

    return left;
  }

  private parseUnary(): N.Expr {
    const start = this.startSpan();
    const tok = this.peek();

    if (tok.kind === TokenKind.Await) {
      if (!this.isFeatureEnabled("async")) {
        this.error(
          ErrorCode.E201,
          "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`",
          start,
          { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
        );
      }
      this.advance();
      const operand = this.parseUnary();
      return {
        kind: "AwaitExpr",
        expr: operand,
        span: this.endSpan(start),
      };
    }

    if (tok.kind === TokenKind.Minus || tok.kind === TokenKind.Bang || tok.kind === TokenKind.Tilde) {
      this.advance();
      const operand = this.parseUnary();
      return {
        kind: "UnaryExpr",
        op: tok.value as N.UnaryOp,
        operand,
        span: this.endSpan(start),
      };
    }

    return this.parsePostfix();
  }

  private isGenericCall(): boolean {
    if (!this.check(TokenKind.Lt)) return false;
    let i = this.pos + 1;
    let depth = 1;
    while (i < this.tokens.length) {
      const k = this.tokens[i].kind;
      if (k === TokenKind.Lt) depth++;
      else if (k === TokenKind.Gt) {
        depth--;
        if (depth === 0) {
          return this.tokens[i + 1]?.kind === TokenKind.LParen;
        }
      } else if (k === TokenKind.Semicolon || k === TokenKind.Eof || k === TokenKind.Newline) {
        return false;
      }
      i++;
    }
    return false;
  }

  private parsePostfix(): N.Expr {
    let expr = this.parsePrimary();

    while (true) {
      const tok = this.peek();

      if (tok.kind === TokenKind.Lt && this.isGenericCall()) {
        const start = expr.span.start;
        const ltTok = this.advance(); // <
        if (!this.isFeatureEnabled("generics")) {
          this.reporter.error(
            ErrorCode.E201,
            "Generic type arguments are an experimental feature in HKD. Enable with `#feature(generics)` or set `edition = \"2027\"` in hkd.toml",
            ltTok.span,
            { help: ["Add `#feature(generics)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
          );
        }
        const typeArgs: N.TypeExpr[] = [];
        while (!this.check(TokenKind.Gt) && !this.isAtEnd()) {
          typeArgs.push(this.parseTypeExpr());
          if (!this.check(TokenKind.Gt)) {
            this.expect(TokenKind.Comma, "`,` or `>`");
          }
        }
        this.expect(TokenKind.Gt, "`>`");
        const args = this.parseCallArgs();
        expr = {
          kind: "CallExpr",
          callee: expr,
          typeArgs,
          args,
          span: { start, end: this.currentEnd() },
        };
      } else if (tok.kind === TokenKind.LParen) {
        // function call
        const start = expr.span.start;
        const args = this.parseCallArgs();
        expr = {
          kind: "CallExpr",
          callee: expr,
          args,
          span: { start, end: this.currentEnd() },
        };
      } else if (tok.kind === TokenKind.LBracket) {
        // index: expr[i]
        const start = expr.span.start;
        this.advance(); // [
        const index = this.parseExpr();
        this.expect(TokenKind.RBracket, "`]`");
        expr = {
          kind: "IndexExpr",
          object: expr,
          index,
          span: { start, end: this.currentEnd() },
        };
      } else if (tok.kind === TokenKind.Dot) {
        const start = expr.span.start;
        this.advance(); // .
        const property = this.expectIdent("property name");
        expr = {
          kind: "MemberExpr",
          object: expr,
          property,
          optional: false,
          span: { start, end: this.currentEnd() },
        };
      } else if (tok.kind === TokenKind.QuestionDot) {
        const start = expr.span.start;
        this.advance(); // ?.
        const property = this.expectIdent("property name");
        expr = {
          kind: "MemberExpr",
          object: expr,
          property,
          optional: true,
          span: { start, end: this.currentEnd() },
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parseCallArgs(): N.Expr[] {
    this.expect(TokenKind.LParen, "`(`");
    const args: N.Expr[] = [];

    while (!this.check(TokenKind.RParen) && !this.isAtEnd()) {
      args.push(this.parseExpr());
      if (!this.check(TokenKind.RParen)) {
        this.expect(TokenKind.Comma, "`,` or `)`");
      }
    }

    this.expect(TokenKind.RParen, "`)`");
    return args;
  }

  private parsePrimary(): N.Expr {
    const start = this.startSpan();
    const tok = this.peek();

    switch (tok.kind) {
      case TokenKind.Int: {
        this.advance();
        return {
          kind: "IntLiteral",
          value: parseInt(tok.value, tok.value.startsWith("0x") ? 16 : 10),
          raw: tok.value,
          span: this.endSpan(start),
        };
      }

      case TokenKind.Float: {
        this.advance();
        return {
          kind: "FloatLiteral",
          value: parseFloat(tok.value),
          raw: tok.value,
          span: this.endSpan(start),
        };
      }

      case TokenKind.String: {
        this.advance();
        return { kind: "StringLiteral", value: tok.value, span: this.endSpan(start) };
      }

      case TokenKind.True_kw: {
        this.advance();
        return { kind: "BoolLiteral", value: true, span: this.endSpan(start) };
      }

      case TokenKind.False_kw: {
        this.advance();
        return { kind: "BoolLiteral", value: false, span: this.endSpan(start) };
      }

      case TokenKind.Null_kw: {
        this.advance();
        return { kind: "NullLiteral", span: this.endSpan(start) };
      }

      case TokenKind.Self: {
        this.advance();
        return { kind: "IdentExpr", name: "self", span: this.endSpan(start) };
      }

      case TokenKind.Ident: {
        this.advance();
        const name = tok.value;

        // Struct initializer: Name { field: expr }
        // Only if next non-newline token is `{` (disambiguation from block)
        const next = this.peekSkippingNewlines();
        if (next.kind === TokenKind.LBrace && this.isStructInitContext()) {
          this.skipNewlines();
          this.advance(); // {
          this.skipNewlines();
          const fields = this.parseObjectFields();
          this.expect(TokenKind.RBrace, "`}`");
          return {
            kind: "StructInitExpr",
            name,
            fields,
            span: this.endSpan(start),
          };
        }

        return { kind: "IdentExpr", name, span: this.endSpan(start) };
      }

      case TokenKind.LParen: {
        this.advance(); // (
        const expr = this.parseExpr();
        this.expect(TokenKind.RParen, "`)`");
        return expr;
      }

      case TokenKind.LBracket: {
        // Array literal
        this.advance(); // [
        this.skipNewlines();
        const elements: N.Expr[] = [];
        while (!this.check(TokenKind.RBracket) && !this.isAtEnd()) {
          elements.push(this.parseExpr());
          this.skipNewlines();
          if (!this.check(TokenKind.RBracket)) {
            this.expect(TokenKind.Comma, "`,` or `]`");
            this.skipNewlines();
          }
        }
        this.expect(TokenKind.RBracket, "`]`");
        return { kind: "ArrayExpr", elements, span: this.endSpan(start) };
      }

      case TokenKind.LBrace: {
        // Object literal: { key: value, ... }
        this.advance(); // {
        this.skipNewlines();
        const fields = this.parseObjectFields();
        this.expect(TokenKind.RBrace, "`}`");
        return { kind: "ObjectExpr", fields, span: this.endSpan(start) };
      }

      case TokenKind.Fn: {
        // Anonymous function
        this.advance(); // fn
        let typeParams: string[] | undefined;
        if (this.check(TokenKind.Lt)) {
          typeParams = this.parseTypeParams().typeParams;
        }
        const params = this.parseParams();
        let returnType: N.TypeExpr | null = null;
        if (this.check(TokenKind.Arrow)) {
          this.advance();
          returnType = this.parseTypeExpr();
        }
        this.skipNewlines();
        const body = this.parseBlock();
        return {
          kind: "FunctionExpr",
          typeParams,
          params,
          returnType,
          body,
          span: this.endSpan(start),
        };
      }

      case TokenKind.Async: {
        if (this.peekAt(1)?.kind === TokenKind.Fn) {
          const asyncTok = this.advance(); // async
          if (!this.isFeatureEnabled("async")) {
            this.error(
              ErrorCode.E201,
              "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`",
              asyncTok.span.start,
              { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
            );
          }
          this.advance(); // fn
          let typeParams: string[] | undefined;
          if (this.check(TokenKind.Lt)) {
            typeParams = this.parseTypeParams().typeParams;
          }
          const params = this.parseParams();
          let returnType: N.TypeExpr | null = null;
          if (this.check(TokenKind.Arrow)) {
            this.advance();
            returnType = this.parseTypeExpr();
          }
          this.skipNewlines();
          const body = this.parseBlock();
          return {
            kind: "FunctionExpr",
            isAsync: true,
            typeParams,
            params,
            returnType,
            body,
            span: this.endSpan(start),
          };
        }
        if (!this.isFeatureEnabled("async")) {
          return { kind: "IdentExpr", name: this.advance().value, span: this.endSpan(start) };
        }
        const asyncTok = this.advance();
        this.error(
          ErrorCode.E204,
          `Unexpected token \`${asyncTok.value}\` in expression`,
          start,
          { help: ["Expected `async fn`"] }
        );
        return { kind: "NullLiteral", span: this.endSpan(start) };
      }

      case TokenKind.Await: {
        if (!this.isFeatureEnabled("async")) {
          return { kind: "IdentExpr", name: this.advance().value, span: this.endSpan(start) };
        }
        const awaitTok = this.advance();
        this.error(
          ErrorCode.E204,
          `Unexpected token \`${awaitTok.value}\` in expression`,
          start
        );
        return { kind: "NullLiteral", span: this.endSpan(start) };
      }

      case TokenKind.If: {
        // if expression
        const ifStmt = this.parseIfStmt();
        return {
          kind: "IfExpr",
          condition: ifStmt.condition,
          then: ifStmt.then,
          else_: ifStmt.else_ as N.BlockStmt | N.IfExpr | null,
          span: this.endSpan(start),
        };
      }

      case TokenKind.Match: {
        return this.parseMatchExpr();
      }

      default: {
        this.error(
          ErrorCode.E204,
          `Unexpected token \`${tok.value}\` in expression`,
          start,
          { help: [`Expected a value, identifier, or expression`] }
        );
        // return a null literal as error recovery
        return { kind: "NullLiteral", span: this.endSpan(start) };
      }
    }
  }

  private parseMatchExpr(): N.MatchExpr {
    const start = this.startSpan();
    const matchTok = this.advance(); // match

    if (!this.isFeatureEnabled("pattern_matching")) {
      this.reporter.error(
        ErrorCode.E201,
        "Pattern matching is an experimental feature in HKD. Enable it with `#feature(pattern_matching)` or set `edition = \"2027\"` in hkd.toml",
        matchTok.span,
        { help: ["Add `#feature(pattern_matching)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] }
      );
    }

    const scrutinee = this.parseExpr();

    this.skipNewlines();
    this.expect(TokenKind.LBrace, "`{`");
    this.skipNewlines();

    const arms: N.MatchArm[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const armStart = this.startSpan();
      const pattern = this.parsePattern();

      let guard: N.Expr | null = null;
      if (this.check(TokenKind.If)) {
        this.advance(); // if
        guard = this.parseExpr();
      }

      this.expect(TokenKind.FatArrow, "`=>`");
      this.skipNewlines();

      let body: N.Expr | N.BlockStmt;
      if (this.check(TokenKind.LBrace)) {
        body = this.parseBlock();
      } else {
        body = this.parseExpr();
      }

      arms.push({
        kind: "MatchArm",
        pattern,
        guard,
        body,
        span: this.endSpan(armStart),
      });

      this.skipNewlines();
      if (this.check(TokenKind.Comma)) {
        this.advance();
        this.skipNewlines();
      }
    }

    this.expect(TokenKind.RBrace, "`}`");

    return {
      kind: "MatchExpr",
      scrutinee,
      arms,
      span: this.endSpan(start),
    };
  }

  private parsePattern(): N.Pattern {
    const start = this.startSpan();
    const tok = this.peek();

    // Wildcard: _
    if (tok.kind === TokenKind.Ident && tok.value === "_") {
      this.advance();
      return { kind: "WildcardPattern", span: this.endSpan(start) };
    }

    // Array pattern: [p1, p2, ...]
    if (tok.kind === TokenKind.LBracket) {
      this.advance(); // [
      this.skipNewlines();
      const elements: N.Pattern[] = [];
      while (!this.check(TokenKind.RBracket) && !this.isAtEnd()) {
        elements.push(this.parsePattern());
        this.skipNewlines();
        if (!this.check(TokenKind.RBracket)) {
          this.expect(TokenKind.Comma, "`,` or `]`");
          this.skipNewlines();
        }
      }
      this.expect(TokenKind.RBracket, "`]`");
      return { kind: "ArrayPattern", elements, span: this.endSpan(start) };
    }

    // Literals: Int, Float, String, True, False, Null
    if (tok.kind === TokenKind.Int) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "IntLiteral", value: parseInt(tok.value, tok.value.startsWith("0x") ? 16 : 10), raw: tok.value, span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }
    if (tok.kind === TokenKind.Float) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "FloatLiteral", value: parseFloat(tok.value), raw: tok.value, span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }
    if (tok.kind === TokenKind.String) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "StringLiteral", value: tok.value, span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }
    if (tok.kind === TokenKind.True_kw) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "BoolLiteral", value: true, span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }
    if (tok.kind === TokenKind.False_kw) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "BoolLiteral", value: false, span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }
    if (tok.kind === TokenKind.Null_kw) {
      this.advance();
      return {
        kind: "LiteralPattern",
        literal: { kind: "NullLiteral", span: this.endSpan(start) },
        span: this.endSpan(start),
      };
    }

    // Ident pattern: x
    if (tok.kind === TokenKind.Ident) {
      this.advance();
      return { kind: "IdentPattern", name: tok.value, span: this.endSpan(start) };
    }

    this.error(
      ErrorCode.E204,
      `Unexpected token \`${tok.value}\` in pattern`,
      start,
      { help: ["Expected a literal, identifier, wildcard `_`, or array pattern `[...]`"] }
    );
    return { kind: "WildcardPattern", span: this.endSpan(start) };
  }

  private parseObjectFields(): N.ObjectField[] {
    const fields: N.ObjectField[] = [];

    while (
      !this.check(TokenKind.RBrace) &&
      !this.isAtEnd() &&
      (this.check(TokenKind.Ident) || this.check(TokenKind.String))
    ) {
      const fStart = this.startSpan();
      const prevTok = this.advance();
      const key = prevTok.value;
      let value: N.Expr;
      if (this.check(TokenKind.Colon)) {
        this.advance();
        value = this.parseExpr();
      } else if (prevTok.kind === TokenKind.Ident) {
        value = { kind: "IdentExpr", name: key, span: this.endSpan(fStart) };
      } else {
        this.expect(TokenKind.Colon, "`:`");
        value = this.parseExpr();
      }
      fields.push({ key, value, span: this.endSpan(fStart) });
      this.skipNewlines();
      if (!this.check(TokenKind.RBrace)) {
        if (this.check(TokenKind.Comma)) {
          this.advance();
          this.skipNewlines();
        }
      }
    }

    return fields;
  }

  private parseInfix(left: N.Expr, opTok: Token, prec: number): N.Expr {
    const start = left.span.start;

    switch (opTok.kind) {
      // Assignment: = += -= *= /= %=
      case TokenKind.Eq: {
        const value = this.parseExpr(Prec.Assignment - 1);
        return { kind: "AssignExpr", target: left, value, span: this.endSpan2(start) };
      }
      case TokenKind.PlusEq:
      case TokenKind.MinusEq:
      case TokenKind.StarEq:
      case TokenKind.SlashEq:
      case TokenKind.PercentEq: {
        const value = this.parseExpr(Prec.Assignment - 1);
        return {
          kind: "CompoundAssignExpr",
          op: opTok.value as N.CompoundAssignOp,
          target: left,
          value,
          span: this.endSpan2(start),
        };
      }

      // Range: .. or ..=
      case TokenKind.DotDot: {
        const inclusive = this.check(TokenKind.Eq);
        if (inclusive) this.advance();
        const end = this.parseExpr(prec);
        return { kind: "RangeExpr", start: left, end, inclusive, span: this.endSpan2(start) };
      }

      // as cast
      case TokenKind.As: {
        const targetType = this.parseTypeExpr();
        return { kind: "CastExpr", expr: left, targetType, span: this.endSpan2(start) };
      }

      // Binary operators
      default: {
        const right = this.parseExpr(this.isRightAssoc(opTok.kind) ? prec - 1 : prec);
        return {
          kind: "BinaryExpr",
          op: opTok.value as N.BinaryOp,
          left,
          right,
          span: this.endSpan2(start),
        };
      }
    }
  }

  private infixPrec(kind: TokenKind): number {
    switch (kind) {
      case TokenKind.Eq:
      case TokenKind.PlusEq:
      case TokenKind.MinusEq:
      case TokenKind.StarEq:
      case TokenKind.SlashEq:
      case TokenKind.PercentEq:
        return Prec.Assignment;
      case TokenKind.DotDot:
        return Prec.Assignment + 1;
      case TokenKind.PipePipe:  return Prec.LogicalOr;
      case TokenKind.AmpAmp:    return Prec.LogicalAnd;
      case TokenKind.Pipe:      return Prec.BitwiseOr;
      case TokenKind.Caret:     return Prec.BitwiseXor;
      case TokenKind.Amp:       return Prec.BitwiseAnd;
      case TokenKind.EqEq:
      case TokenKind.BangEq:    return Prec.Equality;
      case TokenKind.Lt:
      case TokenKind.LtEq:
      case TokenKind.Gt:
      case TokenKind.GtEq:      return Prec.Comparison;
      case TokenKind.LtLt:
      case TokenKind.GtGt:      return Prec.Shift;
      case TokenKind.Plus:
      case TokenKind.Minus:     return Prec.Additive;
      case TokenKind.Star:
      case TokenKind.Slash:
      case TokenKind.Percent:   return Prec.Multiplicative;
      case TokenKind.StarStar:  return Prec.Exponent;
      case TokenKind.As:        return Prec.Call;
      default: return Prec.None;
    }
  }

  private isRightAssoc(kind: TokenKind): boolean {
    return kind === TokenKind.StarStar;
  }

  // Is the current context a struct init (not a block)?
  // Heuristic: we check if the ident token's text starts with uppercase.
  private isStructInitContext(): boolean {
    // Look back at previous ident token — struct names start with uppercase by convention
    const prev = this.tokens[this.pos - 1];
    if (!prev || prev.kind !== TokenKind.Ident) return false;
    return prev.value[0] >= "A" && prev.value[0] <= "Z";
  }

  // ── Token utilities ───────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos] ?? this.eofToken();
  }

  private peekAt(offset: number): Token {
    return this.tokens[this.pos + offset] ?? this.eofToken();
  }

  private peekSkippingNewlines(): Token {
    let i = this.pos;
    while (i < this.tokens.length && this.tokens[i].kind === TokenKind.Newline) {
      i++;
    }
    return this.tokens[i] ?? this.eofToken();
  }

  private advance(): Token {
    const tok = this.tokens[this.pos];
    if (tok) this.pos++;
    return tok ?? this.eofToken();
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkAny(...kinds: TokenKind[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  private isAtEnd(): boolean {
    return this.peek().kind === TokenKind.Eof;
  }

  private expect(kind: TokenKind, what: string): Token {
    if (this.check(kind)) return this.advance();
    const tok = this.peek();
    this.error(
      ErrorCode.E202,
      `Expected ${what}, found \`${tok.value}\``,
      tok.span.start,
      { help: [`Add ${what} before \`${tok.value}\``] }
    );
    return tok; // error recovery
  }

  private expectIdent(what: string): string {
    if (this.check(TokenKind.Ident)) return this.advance().value;
    if (this.check(TokenKind.Async) || this.check(TokenKind.Await)) {
      return this.advance().value;
    }
    const tok = this.peek();
    this.error(
      ErrorCode.E202,
      `Expected ${what}, found \`${tok.value}\``,
      tok.span.start
    );
    return "_error_"; // recovery
  }

  private skipNewlines(): void {
    while (this.check(TokenKind.Newline)) this.advance();
  }

  private skipStatementTerminators(): void {
    while (this.checkAny(TokenKind.Newline, TokenKind.Semicolon)) this.advance();
  }

  // ── Error handling ────────────────────────────────────────────────────────

  private error(
    code: ErrorCode,
    message: string,
    start: SourceLocation | SourceSpan,
    opts: { label?: string; help?: string[] } = {}
  ): never {
    const span = "file" in start ? { start, end: this.currentEnd() } : start;
    this.reporter.error(code, message, span as SourceSpan, opts);
    throw new ParseError(message);
  }

  /** Skip tokens until a safe restart point after a parse error. */
  private synchronize(): void {
    if (this.pos === this.lastErrorPos) {
      this.advance();
    }
    this.lastErrorPos = this.pos;

    while (!this.isAtEnd()) {
      const tok = this.peek();
      // Stop at statement-starting tokens
      if (
        tok.kind === TokenKind.Newline ||
        tok.kind === TokenKind.Semicolon ||
        tok.kind === TokenKind.Fn ||
        tok.kind === TokenKind.Let ||
        tok.kind === TokenKind.Const ||
        tok.kind === TokenKind.Return ||
        tok.kind === TokenKind.If ||
        tok.kind === TokenKind.While ||
        tok.kind === TokenKind.For ||
        tok.kind === TokenKind.Import ||
        tok.kind === TokenKind.Export ||
        tok.kind === TokenKind.RBrace
      ) {
        this.skipStatementTerminators();
        return;
      }
      this.advance();
    }
  }

  // ── Span utilities ────────────────────────────────────────────────────────

  private startSpan(): SourceLocation {
    return this.peek().span.start;
  }

  private endSpan(start: SourceLocation): SourceSpan {
    const end = this.pos > 0
      ? this.tokens[this.pos - 1]?.span.end ?? start
      : start;
    return { start, end };
  }

  private endSpan2(start: SourceLocation): SourceSpan {
    return this.endSpan(start);
  }

  private currentEnd(): SourceLocation {
    return this.pos > 0
      ? this.tokens[this.pos - 1]?.span.end ?? { file: this.fileName, line: 1, column: 1, offset: 0 }
      : { file: this.fileName, line: 1, column: 1, offset: 0 };
  }

  private eofToken(): Token {
    const last = this.tokens[this.tokens.length - 1];
    const loc = last?.span.end ?? { file: this.fileName, line: 1, column: 1, offset: 0 };
    return {
      kind: TokenKind.Eof,
      value: "",
      span: { start: loc, end: loc },
    };
  }
}

// ─── Internal parse error (used for control flow only) ───────────────────────

class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

// ─── Convenience function ─────────────────────────────────────────────────────

export function parse(
  tokens: Token[],
  source: string,
  fileName = "<stdin>",
  reporter?: ErrorReporter,
  edition: "2026" | "2027" = "2026"
): N.Program {
  const rep = reporter ?? new ErrorReporter(source, fileName);
  const parser = new Parser(tokens, source, fileName, rep, edition);
  return parser.parse();
}
