"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
exports.parse = parse;
const index_js_1 = require("../errors/index.js");
const token_js_1 = require("../lexer/token.js");
// ─── Parser class ─────────────────────────────────────────────────────────────
class Parser {
    tokens;
    pos = 0;
    reporter;
    source;
    fileName;
    lastErrorPos = -1;
    edition;
    enabledFeatures = new Set();
    constructor(tokens, source, fileName, reporter, edition = "2026") {
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
    isFeatureEnabled(name) {
        return (this.edition === "2027" ||
            this.enabledFeatures.has(name) ||
            this.enabledFeatures.has("all"));
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    parse() {
        const start = this.startSpan();
        const statements = [];
        this.skipNewlines();
        // Parse any top-level feature directives (#feature(...) or #![feature(...)])
        while (this.check(token_js_1.TokenKind.Hash)) {
            this.parseFeatureDirective();
            this.skipStatementTerminators();
            this.skipNewlines();
        }
        while (!this.isAtEnd()) {
            try {
                const stmt = this.parseStatement();
                if (stmt)
                    statements.push(stmt);
                this.skipStatementTerminators();
            }
            catch (e) {
                if (e instanceof ParseError) {
                    this.synchronize();
                }
                else {
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
    parseFeatureDirective() {
        this.advance(); // #
        if (this.check(token_js_1.TokenKind.Bang)) {
            this.advance(); // !
            this.expect(token_js_1.TokenKind.LBracket, "`[`");
            const ident = this.expectIdent("directive name");
            if (ident === "feature") {
                this.expect(token_js_1.TokenKind.LParen, "`(`");
                const feat = this.expectIdent("feature name");
                this.enabledFeatures.add(feat);
                this.expect(token_js_1.TokenKind.RParen, "`)`");
            }
            this.expect(token_js_1.TokenKind.RBracket, "`]`");
            return;
        }
        const ident = this.expectIdent("directive name");
        if (ident === "feature") {
            this.expect(token_js_1.TokenKind.LParen, "`(`");
            const feat = this.expectIdent("feature name");
            this.enabledFeatures.add(feat);
            this.expect(token_js_1.TokenKind.RParen, "`)`");
        }
    }
    // ── Statement parsing ─────────────────────────────────────────────────────
    parseStatement() {
        this.skipNewlines();
        const tok = this.peek();
        switch (tok.kind) {
            case token_js_1.TokenKind.Let: return this.parseVarDecl(true);
            case token_js_1.TokenKind.Const: return this.parseVarDecl(false);
            case token_js_1.TokenKind.Fn: return this.parseFunctionDecl(false);
            case token_js_1.TokenKind.Struct: return this.parseStructDecl(false);
            case token_js_1.TokenKind.Impl: return this.parseImpl();
            case token_js_1.TokenKind.Trait: return this.parseTraitDecl(false);
            case token_js_1.TokenKind.Type: return this.parseTypeAlias(false);
            case token_js_1.TokenKind.Return: return this.parseReturn();
            case token_js_1.TokenKind.Break: return this.parseBreak();
            case token_js_1.TokenKind.Continue: return this.parseContinue();
            case token_js_1.TokenKind.If: return this.parseIfStmt();
            case token_js_1.TokenKind.While: return this.parseWhile();
            case token_js_1.TokenKind.For: return this.parseFor();
            case token_js_1.TokenKind.LBrace: return this.parseBlock();
            case token_js_1.TokenKind.Import: return this.parseImport();
            case token_js_1.TokenKind.Export: return this.parseExport();
            case token_js_1.TokenKind.Test: return this.parseTest();
            case token_js_1.TokenKind.Assert: return this.parseAssertStmt();
            case token_js_1.TokenKind.Async: {
                if (this.peekAt(1)?.kind === token_js_1.TokenKind.Fn) {
                    return this.parseFunctionDecl(false, true);
                }
                return this.parseExprStmt();
            }
            default: return this.parseExprStmt();
        }
    }
    // let / const declaration
    parseVarDecl(mutable) {
        const start = this.startSpan();
        this.advance(); // consume let / const
        const name = this.expectIdent("variable name");
        let typeAnnotation = null;
        if (this.check(token_js_1.TokenKind.Colon)) {
            this.advance();
            typeAnnotation = this.parseTypeExpr();
        }
        let initializer = null;
        if (this.check(token_js_1.TokenKind.Eq)) {
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
        }
        else {
            if (!initializer) {
                this.error(index_js_1.ErrorCode.E202, "const declaration requires an initializer", start);
            }
            return {
                kind: "ConstDeclStmt",
                name,
                typeAnnotation,
                initializer: initializer,
                mutable: false,
                span: this.endSpan(start),
            };
        }
    }
    // async? fn name<T, U>(params) -> ReturnType { body }
    parseFunctionDecl(exported, isAsync = false) {
        const start = this.startSpan();
        if (isAsync) {
            const asyncTok = this.expect(token_js_1.TokenKind.Async, "`async`");
            if (!this.isFeatureEnabled("async")) {
                this.error(index_js_1.ErrorCode.E201, "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`", asyncTok.span.start, { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
            }
        }
        this.expect(token_js_1.TokenKind.Fn, "`fn`");
        const name = this.expectIdent("function name");
        let typeParams;
        let typeParamBounds;
        if (this.check(token_js_1.TokenKind.Lt)) {
            const tp = this.parseTypeParams();
            typeParams = tp.typeParams;
            typeParamBounds = tp.typeParamBounds;
        }
        const params = this.parseParams();
        let returnType = null;
        if (this.check(token_js_1.TokenKind.Arrow)) {
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
    parseTypeParams() {
        const startTok = this.advance(); // consume '<'
        if (!this.isFeatureEnabled("generics")) {
            this.reporter.error(index_js_1.ErrorCode.E201, "Generic functions are an experimental feature in HKD. Enable with `#feature(generics)` or set `edition = \"2027\"` in hkd.toml", startTok.span, { help: ["Add `#feature(generics)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
        }
        const typeParams = [];
        const typeParamBounds = {};
        let hasBounds = false;
        while (!this.check(token_js_1.TokenKind.Gt) && !this.isAtEnd()) {
            const name = this.expectIdent("type parameter name");
            typeParams.push(name);
            if (this.check(token_js_1.TokenKind.Colon)) {
                this.advance(); // consume ':'
                if (!this.isFeatureEnabled("traits")) {
                    this.reporter.error(index_js_1.ErrorCode.E201, "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml", this.peek().span, { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
                }
                const bound = this.expectIdent("trait constraint name");
                typeParamBounds[name] = bound;
                hasBounds = true;
            }
            if (!this.check(token_js_1.TokenKind.Gt)) {
                this.expect(token_js_1.TokenKind.Comma, "`,` or `>`");
            }
        }
        this.expect(token_js_1.TokenKind.Gt, "`>`");
        return {
            typeParams,
            typeParamBounds: hasBounds ? typeParamBounds : undefined,
        };
    }
    parseParams() {
        this.expect(token_js_1.TokenKind.LParen, "`(`");
        const params = [];
        while (!this.check(token_js_1.TokenKind.RParen) && !this.isAtEnd()) {
            const pStart = this.startSpan();
            let name;
            if (this.check(token_js_1.TokenKind.Self)) {
                name = this.advance().value;
            }
            else {
                name = this.expectIdent("parameter name");
            }
            let typeAnnotation = null;
            if (this.check(token_js_1.TokenKind.Colon)) {
                this.advance();
                typeAnnotation = this.parseTypeExpr();
            }
            let defaultValue = null;
            if (this.check(token_js_1.TokenKind.Eq)) {
                this.advance();
                defaultValue = this.parseExpr();
            }
            params.push({
                name,
                typeAnnotation,
                defaultValue,
                span: this.endSpan(pStart),
            });
            if (!this.check(token_js_1.TokenKind.RParen)) {
                this.expect(token_js_1.TokenKind.Comma, "`,` or `)`");
            }
        }
        this.expect(token_js_1.TokenKind.RParen, "`)`");
        return params;
    }
    // struct Name { field: Type, ... }
    parseStructDecl(exported) {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Struct, "`struct`");
        const name = this.expectIdent("struct name");
        this.skipNewlines();
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        this.skipNewlines();
        const fields = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            const fStart = this.startSpan();
            const fname = this.expectIdent("field name");
            this.expect(token_js_1.TokenKind.Colon, "`:`");
            const typeAnnotation = this.parseTypeExpr();
            let defaultValue = null;
            if (this.check(token_js_1.TokenKind.Eq)) {
                this.advance();
                defaultValue = this.parseExpr();
            }
            fields.push({
                name: fname,
                typeAnnotation,
                defaultValue,
                span: this.endSpan(fStart),
            });
            if (this.check(token_js_1.TokenKind.Comma)) {
                this.advance();
            }
            this.skipStatementTerminators();
        }
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return {
            kind: "StructDeclStmt",
            name,
            fields,
            exported,
            span: this.endSpan(start),
        };
    }
    // impl StructName { ... } or impl TraitName for StructName { ... }
    parseImpl() {
        const start = this.startSpan();
        const implTok = this.expect(token_js_1.TokenKind.Impl, "`impl`");
        const firstName = this.expectIdent("struct or trait name");
        let traitName = undefined;
        let structName = firstName;
        this.skipNewlines();
        if (this.check(token_js_1.TokenKind.For)) {
            this.advance(); // consume 'for'
            if (!this.isFeatureEnabled("traits")) {
                this.reporter.error(index_js_1.ErrorCode.E201, "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml", implTok.span, { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
            }
            traitName = firstName;
            structName = this.expectIdent("struct name");
        }
        this.skipNewlines();
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        this.skipNewlines();
        const methods = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check(token_js_1.TokenKind.RBrace))
                break;
            if (this.check(token_js_1.TokenKind.Fn)) {
                methods.push(this.parseFunctionDecl(false, false));
            }
            else if (this.check(token_js_1.TokenKind.Async)) {
                methods.push(this.parseFunctionDecl(false, true));
            }
            else {
                this.error(index_js_1.ErrorCode.E201, `Expected method declaration inside impl block, got \`${this.peek().value}\``, this.peek().span);
                this.advance();
            }
            this.skipStatementTerminators();
        }
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return {
            kind: "ImplBlockStmt",
            traitName,
            structName,
            methods,
            span: this.endSpan(start),
        };
    }
    // trait TraitName { fn method(self, ...) -> ReturnType; ... }
    parseTraitDecl(exported) {
        const start = this.startSpan();
        const traitTok = this.expect(token_js_1.TokenKind.Trait, "`trait`");
        if (!this.isFeatureEnabled("traits")) {
            this.reporter.error(index_js_1.ErrorCode.E201, "Traits are an experimental feature in HKD. Enable with `#feature(traits)` or set `edition = \"2027\"` in hkd.toml", traitTok.span, { help: ["Add `#feature(traits)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
        }
        const name = this.expectIdent("trait name");
        this.skipNewlines();
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        this.skipNewlines();
        const methods = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            this.skipNewlines();
            if (this.check(token_js_1.TokenKind.RBrace))
                break;
            const mStart = this.startSpan();
            this.expect(token_js_1.TokenKind.Fn, "`fn`");
            const methodName = this.expectIdent("method name");
            const params = this.parseParams();
            let returnType = null;
            if (this.check(token_js_1.TokenKind.Arrow)) {
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
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return {
            kind: "TraitDeclStmt",
            name,
            methods,
            exported,
            span: this.endSpan(start),
        };
    }
    // type Alias = TypeExpr
    parseTypeAlias(exported) {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Type, "`type`");
        const name = this.expectIdent("type name");
        this.expect(token_js_1.TokenKind.Eq, "`=`");
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
    parseReturn() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Return, "`return`");
        let value = null;
        if (!this.checkAny(token_js_1.TokenKind.Newline, token_js_1.TokenKind.Semicolon, token_js_1.TokenKind.RBrace, token_js_1.TokenKind.Eof)) {
            value = this.parseExpr();
        }
        return { kind: "ReturnStmt", value, span: this.endSpan(start) };
    }
    // break
    parseBreak() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Break, "`break`");
        return { kind: "BreakStmt", span: this.endSpan(start) };
    }
    // continue
    parseContinue() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Continue, "`continue`");
        return { kind: "ContinueStmt", span: this.endSpan(start) };
    }
    // if condition { ... } else { ... }
    parseIfStmt() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.If, "`if`");
        const condition = this.parseExpr();
        this.skipNewlines();
        const then = this.parseBlock();
        let else_ = null;
        this.skipNewlines();
        if (this.check(token_js_1.TokenKind.Else)) {
            this.advance();
            this.skipNewlines();
            if (this.check(token_js_1.TokenKind.If)) {
                else_ = this.parseIfStmt();
            }
            else {
                else_ = this.parseBlock();
            }
        }
        return { kind: "IfStmt", condition, then, else_, span: this.endSpan(start) };
    }
    // while condition { ... }
    parseWhile() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.While, "`while`");
        const condition = this.parseExpr();
        this.skipNewlines();
        const body = this.parseBlock();
        return { kind: "WhileStmt", condition, body, span: this.endSpan(start) };
    }
    // for variable in iterable { ... }
    parseFor() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.For, "`for`");
        const variable = this.expectIdent("loop variable");
        this.expect(token_js_1.TokenKind.In, "`in`");
        const iterable = this.parseExpr();
        this.skipNewlines();
        const body = this.parseBlock();
        return { kind: "ForStmt", variable, iterable, body, span: this.endSpan(start) };
    }
    // { stmts... }
    parseBlock() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        this.skipNewlines();
        const body = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            try {
                const stmt = this.parseStatement();
                if (stmt)
                    body.push(stmt);
                this.skipStatementTerminators();
            }
            catch (e) {
                if (e instanceof ParseError) {
                    this.synchronize();
                    if (this.check(token_js_1.TokenKind.RBrace))
                        break;
                }
                else {
                    throw e;
                }
            }
        }
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return { kind: "BlockStmt", body, span: this.endSpan(start) };
    }
    // import math
    // import { add } from "math"
    // import math from "std.math"
    parseImport() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Import, "`import`");
        let defaultName = null;
        let specifiers = [];
        let source = "";
        if (this.check(token_js_1.TokenKind.LBrace)) {
            // import { add, sub } from "math"
            specifiers = this.parseImportSpecifiers();
            this.expect(token_js_1.TokenKind.From, "`from`");
            source = this.parseStringLiteralValue();
        }
        else if (this.check(token_js_1.TokenKind.Ident)) {
            defaultName = this.advance().value;
            if (this.check(token_js_1.TokenKind.From)) {
                // import math from "std.math"
                this.advance();
                source = this.parseStringLiteralValue();
            }
            else {
                // import math  (bare import — module name is the path)
                source = defaultName;
            }
        }
        else {
            this.error(index_js_1.ErrorCode.E201, "Expected module name or `{` after `import`", start);
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
    parseImportSpecifiers() {
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        const specifiers = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            const sStart = this.startSpan();
            const name = this.expectIdent("export name");
            let alias = null;
            if (this.check(token_js_1.TokenKind.As)) {
                this.advance();
                alias = this.expectIdent("alias");
            }
            specifiers.push({ name, alias, span: this.endSpan(sStart) });
            if (!this.check(token_js_1.TokenKind.RBrace)) {
                this.expect(token_js_1.TokenKind.Comma, "`,` or `}`");
            }
        }
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return specifiers;
    }
    parseStringLiteralValue() {
        if (!this.check(token_js_1.TokenKind.String)) {
            this.error(index_js_1.ErrorCode.E202, "Expected string literal", this.startSpan());
            return "";
        }
        return this.advance().value;
    }
    // export fn / let / const / struct / type
    parseExport() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Export, "`export`");
        let decl;
        const tok = this.peek();
        switch (tok.kind) {
            case token_js_1.TokenKind.Fn:
                decl = this.parseFunctionDecl(true);
                break;
            case token_js_1.TokenKind.Async:
                decl = this.parseFunctionDecl(true, true);
                break;
            case token_js_1.TokenKind.Let:
                decl = this.parseVarDecl(true);
                decl;
                break;
            case token_js_1.TokenKind.Const:
                decl = this.parseVarDecl(false);
                break;
            case token_js_1.TokenKind.Struct:
                decl = this.parseStructDecl(true);
                break;
            case token_js_1.TokenKind.Trait:
                decl = this.parseTraitDecl(true);
                break;
            case token_js_1.TokenKind.Type:
                decl = this.parseTypeAlias(true);
                break;
            default:
                this.error(index_js_1.ErrorCode.E201, "Expected declaration after `export`", start);
                decl = this.parseFunctionDecl(true); // recovery
        }
        return { kind: "ExportStmt", declaration: decl, span: this.endSpan(start) };
    }
    // test "description" { body }
    parseTest() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Test, "`test`");
        if (!this.check(token_js_1.TokenKind.String)) {
            this.error(index_js_1.ErrorCode.E202, "Expected test description string", start);
        }
        const description = this.advance().value;
        this.skipNewlines();
        const body = this.parseBlock();
        return { kind: "TestStmt", description, body, span: this.endSpan(start) };
    }
    // assert(condition)  or  assert(condition, "message")
    parseAssertStmt() {
        const start = this.startSpan();
        this.expect(token_js_1.TokenKind.Assert, "`assert`");
        this.expect(token_js_1.TokenKind.LParen, "`(`");
        const condition = this.parseExpr();
        let message = null;
        if (this.check(token_js_1.TokenKind.Comma)) {
            this.advance();
            message = this.parseExpr();
        }
        this.expect(token_js_1.TokenKind.RParen, "`)`");
        return { kind: "AssertStmt", condition, message, span: this.endSpan(start) };
    }
    // expression statement
    parseExprStmt() {
        const start = this.startSpan();
        const expr = this.parseExpr();
        return { kind: "ExprStmt", expr, span: this.endSpan(start) };
    }
    // ── Type expression parsing ───────────────────────────────────────────────
    parseTypeExpr() {
        const start = this.startSpan();
        // Array type: [Type]
        if (this.check(token_js_1.TokenKind.LBracket)) {
            this.advance();
            const elementType = this.parseTypeExpr();
            this.expect(token_js_1.TokenKind.RBracket, "`]`");
            return {
                kind: "ArrayType",
                elementType,
                span: this.endSpan(start),
            };
        }
        // Function type: fn(Type, Type) -> Type
        if (this.check(token_js_1.TokenKind.Fn)) {
            this.advance();
            this.expect(token_js_1.TokenKind.LParen, "`(`");
            const params = [];
            while (!this.check(token_js_1.TokenKind.RParen) && !this.isAtEnd()) {
                params.push(this.parseTypeExpr());
                if (!this.check(token_js_1.TokenKind.RParen)) {
                    this.expect(token_js_1.TokenKind.Comma, "`,` or `)`");
                }
            }
            this.expect(token_js_1.TokenKind.RParen, "`)`");
            let returnType = null;
            if (this.check(token_js_1.TokenKind.Arrow)) {
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
        let typeExpr = { kind: "NamedType", name, span: this.endSpan(start) };
        if (this.check(token_js_1.TokenKind.Question)) {
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
    parseExpr(minPrec = 0 /* Prec.None */) {
        let left = this.parseUnary();
        while (true) {
            const tok = this.peekSkippingNewlines();
            const prec = this.infixPrec(tok.kind);
            if (prec <= minPrec)
                break;
            // Consume any newlines before the infix operator
            this.skipNewlines();
            this.advance(); // consume operator
            left = this.parseInfix(left, tok, prec);
        }
        return left;
    }
    parseUnary() {
        const start = this.startSpan();
        const tok = this.peek();
        if (tok.kind === token_js_1.TokenKind.Await) {
            if (!this.isFeatureEnabled("async")) {
                this.error(index_js_1.ErrorCode.E201, "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`", start, { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
            }
            this.advance();
            const operand = this.parseUnary();
            return {
                kind: "AwaitExpr",
                expr: operand,
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.Minus || tok.kind === token_js_1.TokenKind.Bang || tok.kind === token_js_1.TokenKind.Tilde) {
            this.advance();
            const operand = this.parseUnary();
            return {
                kind: "UnaryExpr",
                op: tok.value,
                operand,
                span: this.endSpan(start),
            };
        }
        return this.parsePostfix();
    }
    isGenericCall() {
        if (!this.check(token_js_1.TokenKind.Lt))
            return false;
        let i = this.pos + 1;
        let depth = 1;
        while (i < this.tokens.length) {
            const k = this.tokens[i].kind;
            if (k === token_js_1.TokenKind.Lt)
                depth++;
            else if (k === token_js_1.TokenKind.Gt) {
                depth--;
                if (depth === 0) {
                    return this.tokens[i + 1]?.kind === token_js_1.TokenKind.LParen;
                }
            }
            else if (k === token_js_1.TokenKind.Semicolon || k === token_js_1.TokenKind.Eof || k === token_js_1.TokenKind.Newline) {
                return false;
            }
            i++;
        }
        return false;
    }
    parsePostfix() {
        let expr = this.parsePrimary();
        while (true) {
            const tok = this.peek();
            if (tok.kind === token_js_1.TokenKind.Lt && this.isGenericCall()) {
                const start = expr.span.start;
                const ltTok = this.advance(); // <
                if (!this.isFeatureEnabled("generics")) {
                    this.reporter.error(index_js_1.ErrorCode.E201, "Generic type arguments are an experimental feature in HKD. Enable with `#feature(generics)` or set `edition = \"2027\"` in hkd.toml", ltTok.span, { help: ["Add `#feature(generics)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
                }
                const typeArgs = [];
                while (!this.check(token_js_1.TokenKind.Gt) && !this.isAtEnd()) {
                    typeArgs.push(this.parseTypeExpr());
                    if (!this.check(token_js_1.TokenKind.Gt)) {
                        this.expect(token_js_1.TokenKind.Comma, "`,` or `>`");
                    }
                }
                this.expect(token_js_1.TokenKind.Gt, "`>`");
                const args = this.parseCallArgs();
                expr = {
                    kind: "CallExpr",
                    callee: expr,
                    typeArgs,
                    args,
                    span: { start, end: this.currentEnd() },
                };
            }
            else if (tok.kind === token_js_1.TokenKind.LParen) {
                // function call
                const start = expr.span.start;
                const args = this.parseCallArgs();
                expr = {
                    kind: "CallExpr",
                    callee: expr,
                    args,
                    span: { start, end: this.currentEnd() },
                };
            }
            else if (tok.kind === token_js_1.TokenKind.LBracket) {
                // index: expr[i]
                const start = expr.span.start;
                this.advance(); // [
                const index = this.parseExpr();
                this.expect(token_js_1.TokenKind.RBracket, "`]`");
                expr = {
                    kind: "IndexExpr",
                    object: expr,
                    index,
                    span: { start, end: this.currentEnd() },
                };
            }
            else if (tok.kind === token_js_1.TokenKind.Dot) {
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
            }
            else if (tok.kind === token_js_1.TokenKind.QuestionDot) {
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
            }
            else {
                break;
            }
        }
        return expr;
    }
    parseCallArgs() {
        this.expect(token_js_1.TokenKind.LParen, "`(`");
        const args = [];
        while (!this.check(token_js_1.TokenKind.RParen) && !this.isAtEnd()) {
            args.push(this.parseExpr());
            if (!this.check(token_js_1.TokenKind.RParen)) {
                this.expect(token_js_1.TokenKind.Comma, "`,` or `)`");
            }
        }
        this.expect(token_js_1.TokenKind.RParen, "`)`");
        return args;
    }
    parsePrimary() {
        const start = this.startSpan();
        const tok = this.peek();
        switch (tok.kind) {
            case token_js_1.TokenKind.Int: {
                this.advance();
                return {
                    kind: "IntLiteral",
                    value: parseInt(tok.value, tok.value.startsWith("0x") ? 16 : 10),
                    raw: tok.value,
                    span: this.endSpan(start),
                };
            }
            case token_js_1.TokenKind.Float: {
                this.advance();
                return {
                    kind: "FloatLiteral",
                    value: parseFloat(tok.value),
                    raw: tok.value,
                    span: this.endSpan(start),
                };
            }
            case token_js_1.TokenKind.String: {
                this.advance();
                return { kind: "StringLiteral", value: tok.value, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.True_kw: {
                this.advance();
                return { kind: "BoolLiteral", value: true, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.False_kw: {
                this.advance();
                return { kind: "BoolLiteral", value: false, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.Null_kw: {
                this.advance();
                return { kind: "NullLiteral", span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.Self: {
                this.advance();
                return { kind: "IdentExpr", name: "self", span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.Ident: {
                this.advance();
                const name = tok.value;
                // Struct initializer: Name { field: expr }
                // Only if next non-newline token is `{` (disambiguation from block)
                const next = this.peekSkippingNewlines();
                if (next.kind === token_js_1.TokenKind.LBrace && this.isStructInitContext()) {
                    this.skipNewlines();
                    this.advance(); // {
                    this.skipNewlines();
                    const fields = this.parseObjectFields();
                    this.expect(token_js_1.TokenKind.RBrace, "`}`");
                    return {
                        kind: "StructInitExpr",
                        name,
                        fields,
                        span: this.endSpan(start),
                    };
                }
                return { kind: "IdentExpr", name, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.LParen: {
                this.advance(); // (
                const expr = this.parseExpr();
                this.expect(token_js_1.TokenKind.RParen, "`)`");
                return expr;
            }
            case token_js_1.TokenKind.LBracket: {
                // Array literal
                this.advance(); // [
                this.skipNewlines();
                const elements = [];
                while (!this.check(token_js_1.TokenKind.RBracket) && !this.isAtEnd()) {
                    elements.push(this.parseExpr());
                    this.skipNewlines();
                    if (!this.check(token_js_1.TokenKind.RBracket)) {
                        this.expect(token_js_1.TokenKind.Comma, "`,` or `]`");
                        this.skipNewlines();
                    }
                }
                this.expect(token_js_1.TokenKind.RBracket, "`]`");
                return { kind: "ArrayExpr", elements, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.LBrace: {
                // Object literal: { key: value, ... }
                this.advance(); // {
                this.skipNewlines();
                const fields = this.parseObjectFields();
                this.expect(token_js_1.TokenKind.RBrace, "`}`");
                return { kind: "ObjectExpr", fields, span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.Fn: {
                // Anonymous function
                this.advance(); // fn
                let typeParams;
                if (this.check(token_js_1.TokenKind.Lt)) {
                    typeParams = this.parseTypeParams().typeParams;
                }
                const params = this.parseParams();
                let returnType = null;
                if (this.check(token_js_1.TokenKind.Arrow)) {
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
            case token_js_1.TokenKind.Async: {
                if (this.peekAt(1)?.kind === token_js_1.TokenKind.Fn) {
                    const asyncTok = this.advance(); // async
                    if (!this.isFeatureEnabled("async")) {
                        this.error(index_js_1.ErrorCode.E201, "Async/await is an experimental feature in HKD. Enable with `#feature(async)` or set `edition = \"2027\"` in `hkd.toml`", asyncTok.span.start, { help: ["Add `#feature(async)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
                    }
                    this.advance(); // fn
                    let typeParams;
                    if (this.check(token_js_1.TokenKind.Lt)) {
                        typeParams = this.parseTypeParams().typeParams;
                    }
                    const params = this.parseParams();
                    let returnType = null;
                    if (this.check(token_js_1.TokenKind.Arrow)) {
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
                this.error(index_js_1.ErrorCode.E204, `Unexpected token \`${asyncTok.value}\` in expression`, start, { help: ["Expected `async fn`"] });
                return { kind: "NullLiteral", span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.Await: {
                if (!this.isFeatureEnabled("async")) {
                    return { kind: "IdentExpr", name: this.advance().value, span: this.endSpan(start) };
                }
                const awaitTok = this.advance();
                this.error(index_js_1.ErrorCode.E204, `Unexpected token \`${awaitTok.value}\` in expression`, start);
                return { kind: "NullLiteral", span: this.endSpan(start) };
            }
            case token_js_1.TokenKind.If: {
                // if expression
                const ifStmt = this.parseIfStmt();
                return {
                    kind: "IfExpr",
                    condition: ifStmt.condition,
                    then: ifStmt.then,
                    else_: ifStmt.else_,
                    span: this.endSpan(start),
                };
            }
            case token_js_1.TokenKind.Match: {
                return this.parseMatchExpr();
            }
            default: {
                this.error(index_js_1.ErrorCode.E204, `Unexpected token \`${tok.value}\` in expression`, start, { help: [`Expected a value, identifier, or expression`] });
                // return a null literal as error recovery
                return { kind: "NullLiteral", span: this.endSpan(start) };
            }
        }
    }
    parseMatchExpr() {
        const start = this.startSpan();
        const matchTok = this.advance(); // match
        if (!this.isFeatureEnabled("pattern_matching")) {
            this.reporter.error(index_js_1.ErrorCode.E201, "Pattern matching is an experimental feature in HKD. Enable it with `#feature(pattern_matching)` or set `edition = \"2027\"` in hkd.toml", matchTok.span, { help: ["Add `#feature(pattern_matching)` at top of file, or specify `edition = \"2027\"` in `hkd.toml`"] });
        }
        const scrutinee = this.parseExpr();
        this.skipNewlines();
        this.expect(token_js_1.TokenKind.LBrace, "`{`");
        this.skipNewlines();
        const arms = [];
        while (!this.check(token_js_1.TokenKind.RBrace) && !this.isAtEnd()) {
            const armStart = this.startSpan();
            const pattern = this.parsePattern();
            let guard = null;
            if (this.check(token_js_1.TokenKind.If)) {
                this.advance(); // if
                guard = this.parseExpr();
            }
            this.expect(token_js_1.TokenKind.FatArrow, "`=>`");
            this.skipNewlines();
            let body;
            if (this.check(token_js_1.TokenKind.LBrace)) {
                body = this.parseBlock();
            }
            else {
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
            if (this.check(token_js_1.TokenKind.Comma)) {
                this.advance();
                this.skipNewlines();
            }
        }
        this.expect(token_js_1.TokenKind.RBrace, "`}`");
        return {
            kind: "MatchExpr",
            scrutinee,
            arms,
            span: this.endSpan(start),
        };
    }
    parsePattern() {
        const start = this.startSpan();
        const tok = this.peek();
        // Wildcard: _
        if (tok.kind === token_js_1.TokenKind.Ident && tok.value === "_") {
            this.advance();
            return { kind: "WildcardPattern", span: this.endSpan(start) };
        }
        // Array pattern: [p1, p2, ...]
        if (tok.kind === token_js_1.TokenKind.LBracket) {
            this.advance(); // [
            this.skipNewlines();
            const elements = [];
            while (!this.check(token_js_1.TokenKind.RBracket) && !this.isAtEnd()) {
                elements.push(this.parsePattern());
                this.skipNewlines();
                if (!this.check(token_js_1.TokenKind.RBracket)) {
                    this.expect(token_js_1.TokenKind.Comma, "`,` or `]`");
                    this.skipNewlines();
                }
            }
            this.expect(token_js_1.TokenKind.RBracket, "`]`");
            return { kind: "ArrayPattern", elements, span: this.endSpan(start) };
        }
        // Literals: Int, Float, String, True, False, Null
        if (tok.kind === token_js_1.TokenKind.Int) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "IntLiteral", value: parseInt(tok.value, tok.value.startsWith("0x") ? 16 : 10), raw: tok.value, span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.Float) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "FloatLiteral", value: parseFloat(tok.value), raw: tok.value, span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.String) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "StringLiteral", value: tok.value, span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.True_kw) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "BoolLiteral", value: true, span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.False_kw) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "BoolLiteral", value: false, span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        if (tok.kind === token_js_1.TokenKind.Null_kw) {
            this.advance();
            return {
                kind: "LiteralPattern",
                literal: { kind: "NullLiteral", span: this.endSpan(start) },
                span: this.endSpan(start),
            };
        }
        // Ident pattern: x
        if (tok.kind === token_js_1.TokenKind.Ident) {
            this.advance();
            return { kind: "IdentPattern", name: tok.value, span: this.endSpan(start) };
        }
        this.error(index_js_1.ErrorCode.E204, `Unexpected token \`${tok.value}\` in pattern`, start, { help: ["Expected a literal, identifier, wildcard `_`, or array pattern `[...]`"] });
        return { kind: "WildcardPattern", span: this.endSpan(start) };
    }
    parseObjectFields() {
        const fields = [];
        while (!this.check(token_js_1.TokenKind.RBrace) &&
            !this.isAtEnd() &&
            (this.check(token_js_1.TokenKind.Ident) || this.check(token_js_1.TokenKind.String))) {
            const fStart = this.startSpan();
            const prevTok = this.advance();
            const key = prevTok.value;
            let value;
            if (this.check(token_js_1.TokenKind.Colon)) {
                this.advance();
                value = this.parseExpr();
            }
            else if (prevTok.kind === token_js_1.TokenKind.Ident) {
                value = { kind: "IdentExpr", name: key, span: this.endSpan(fStart) };
            }
            else {
                this.expect(token_js_1.TokenKind.Colon, "`:`");
                value = this.parseExpr();
            }
            fields.push({ key, value, span: this.endSpan(fStart) });
            this.skipNewlines();
            if (!this.check(token_js_1.TokenKind.RBrace)) {
                if (this.check(token_js_1.TokenKind.Comma)) {
                    this.advance();
                    this.skipNewlines();
                }
            }
        }
        return fields;
    }
    parseInfix(left, opTok, prec) {
        const start = left.span.start;
        switch (opTok.kind) {
            // Assignment: = += -= *= /= %=
            case token_js_1.TokenKind.Eq: {
                const value = this.parseExpr(1 /* Prec.Assignment */ - 1);
                return { kind: "AssignExpr", target: left, value, span: this.endSpan2(start) };
            }
            case token_js_1.TokenKind.PlusEq:
            case token_js_1.TokenKind.MinusEq:
            case token_js_1.TokenKind.StarEq:
            case token_js_1.TokenKind.SlashEq:
            case token_js_1.TokenKind.PercentEq: {
                const value = this.parseExpr(1 /* Prec.Assignment */ - 1);
                return {
                    kind: "CompoundAssignExpr",
                    op: opTok.value,
                    target: left,
                    value,
                    span: this.endSpan2(start),
                };
            }
            // Range: .. or ..=
            case token_js_1.TokenKind.DotDot: {
                const inclusive = this.check(token_js_1.TokenKind.Eq);
                if (inclusive)
                    this.advance();
                const end = this.parseExpr(prec);
                return { kind: "RangeExpr", start: left, end, inclusive, span: this.endSpan2(start) };
            }
            // as cast
            case token_js_1.TokenKind.As: {
                const targetType = this.parseTypeExpr();
                return { kind: "CastExpr", expr: left, targetType, span: this.endSpan2(start) };
            }
            // Binary operators
            default: {
                const right = this.parseExpr(this.isRightAssoc(opTok.kind) ? prec - 1 : prec);
                return {
                    kind: "BinaryExpr",
                    op: opTok.value,
                    left,
                    right,
                    span: this.endSpan2(start),
                };
            }
        }
    }
    infixPrec(kind) {
        switch (kind) {
            case token_js_1.TokenKind.Eq:
            case token_js_1.TokenKind.PlusEq:
            case token_js_1.TokenKind.MinusEq:
            case token_js_1.TokenKind.StarEq:
            case token_js_1.TokenKind.SlashEq:
            case token_js_1.TokenKind.PercentEq:
                return 1 /* Prec.Assignment */;
            case token_js_1.TokenKind.DotDot:
                return 1 /* Prec.Assignment */ + 1;
            case token_js_1.TokenKind.PipePipe: return 2 /* Prec.LogicalOr */;
            case token_js_1.TokenKind.AmpAmp: return 3 /* Prec.LogicalAnd */;
            case token_js_1.TokenKind.Pipe: return 4 /* Prec.BitwiseOr */;
            case token_js_1.TokenKind.Caret: return 5 /* Prec.BitwiseXor */;
            case token_js_1.TokenKind.Amp: return 6 /* Prec.BitwiseAnd */;
            case token_js_1.TokenKind.EqEq:
            case token_js_1.TokenKind.BangEq: return 7 /* Prec.Equality */;
            case token_js_1.TokenKind.Lt:
            case token_js_1.TokenKind.LtEq:
            case token_js_1.TokenKind.Gt:
            case token_js_1.TokenKind.GtEq: return 8 /* Prec.Comparison */;
            case token_js_1.TokenKind.LtLt:
            case token_js_1.TokenKind.GtGt: return 9 /* Prec.Shift */;
            case token_js_1.TokenKind.Plus:
            case token_js_1.TokenKind.Minus: return 10 /* Prec.Additive */;
            case token_js_1.TokenKind.Star:
            case token_js_1.TokenKind.Slash:
            case token_js_1.TokenKind.Percent: return 11 /* Prec.Multiplicative */;
            case token_js_1.TokenKind.StarStar: return 12 /* Prec.Exponent */;
            case token_js_1.TokenKind.As: return 14 /* Prec.Call */;
            default: return 0 /* Prec.None */;
        }
    }
    isRightAssoc(kind) {
        return kind === token_js_1.TokenKind.StarStar;
    }
    // Is the current context a struct init (not a block)?
    // Heuristic: we check if the ident token's text starts with uppercase.
    isStructInitContext() {
        // Look back at previous ident token — struct names start with uppercase by convention
        const prev = this.tokens[this.pos - 1];
        if (!prev || prev.kind !== token_js_1.TokenKind.Ident)
            return false;
        return prev.value[0] >= "A" && prev.value[0] <= "Z";
    }
    // ── Token utilities ───────────────────────────────────────────────────────
    peek() {
        return this.tokens[this.pos] ?? this.eofToken();
    }
    peekAt(offset) {
        return this.tokens[this.pos + offset] ?? this.eofToken();
    }
    peekSkippingNewlines() {
        let i = this.pos;
        while (i < this.tokens.length && this.tokens[i].kind === token_js_1.TokenKind.Newline) {
            i++;
        }
        return this.tokens[i] ?? this.eofToken();
    }
    advance() {
        const tok = this.tokens[this.pos];
        if (tok)
            this.pos++;
        return tok ?? this.eofToken();
    }
    check(kind) {
        return this.peek().kind === kind;
    }
    checkAny(...kinds) {
        return kinds.includes(this.peek().kind);
    }
    isAtEnd() {
        return this.peek().kind === token_js_1.TokenKind.Eof;
    }
    expect(kind, what) {
        if (this.check(kind))
            return this.advance();
        const tok = this.peek();
        this.error(index_js_1.ErrorCode.E202, `Expected ${what}, found \`${tok.value}\``, tok.span.start, { help: [`Add ${what} before \`${tok.value}\``] });
        return tok; // error recovery
    }
    expectIdent(what) {
        if (this.check(token_js_1.TokenKind.Ident))
            return this.advance().value;
        if (this.check(token_js_1.TokenKind.Async) || this.check(token_js_1.TokenKind.Await)) {
            return this.advance().value;
        }
        const tok = this.peek();
        this.error(index_js_1.ErrorCode.E202, `Expected ${what}, found \`${tok.value}\``, tok.span.start);
        return "_error_"; // recovery
    }
    skipNewlines() {
        while (this.check(token_js_1.TokenKind.Newline))
            this.advance();
    }
    skipStatementTerminators() {
        while (this.checkAny(token_js_1.TokenKind.Newline, token_js_1.TokenKind.Semicolon))
            this.advance();
    }
    // ── Error handling ────────────────────────────────────────────────────────
    error(code, message, start, opts = {}) {
        const span = "file" in start ? { start, end: this.currentEnd() } : start;
        this.reporter.error(code, message, span, opts);
        throw new ParseError(message);
    }
    /** Skip tokens until a safe restart point after a parse error. */
    synchronize() {
        if (this.pos === this.lastErrorPos) {
            this.advance();
        }
        this.lastErrorPos = this.pos;
        while (!this.isAtEnd()) {
            const tok = this.peek();
            // Stop at statement-starting tokens
            if (tok.kind === token_js_1.TokenKind.Newline ||
                tok.kind === token_js_1.TokenKind.Semicolon ||
                tok.kind === token_js_1.TokenKind.Fn ||
                tok.kind === token_js_1.TokenKind.Let ||
                tok.kind === token_js_1.TokenKind.Const ||
                tok.kind === token_js_1.TokenKind.Return ||
                tok.kind === token_js_1.TokenKind.If ||
                tok.kind === token_js_1.TokenKind.While ||
                tok.kind === token_js_1.TokenKind.For ||
                tok.kind === token_js_1.TokenKind.Import ||
                tok.kind === token_js_1.TokenKind.Export ||
                tok.kind === token_js_1.TokenKind.RBrace) {
                this.skipStatementTerminators();
                return;
            }
            this.advance();
        }
    }
    // ── Span utilities ────────────────────────────────────────────────────────
    startSpan() {
        return this.peek().span.start;
    }
    endSpan(start) {
        const end = this.pos > 0
            ? this.tokens[this.pos - 1]?.span.end ?? start
            : start;
        return { start, end };
    }
    endSpan2(start) {
        return this.endSpan(start);
    }
    currentEnd() {
        return this.pos > 0
            ? this.tokens[this.pos - 1]?.span.end ?? { file: this.fileName, line: 1, column: 1, offset: 0 }
            : { file: this.fileName, line: 1, column: 1, offset: 0 };
    }
    eofToken() {
        const last = this.tokens[this.tokens.length - 1];
        const loc = last?.span.end ?? { file: this.fileName, line: 1, column: 1, offset: 0 };
        return {
            kind: token_js_1.TokenKind.Eof,
            value: "",
            span: { start: loc, end: loc },
        };
    }
}
exports.Parser = Parser;
// ─── Internal parse error (used for control flow only) ───────────────────────
class ParseError extends Error {
    constructor(message) {
        super(message);
        this.name = "ParseError";
    }
}
// ─── Convenience function ─────────────────────────────────────────────────────
function parse(tokens, source, fileName = "<stdin>", reporter, edition = "2026") {
    const rep = reporter ?? new index_js_1.ErrorReporter(source, fileName);
    const parser = new Parser(tokens, source, fileName, rep, edition);
    return parser.parse();
}
//# sourceMappingURL=parser.js.map