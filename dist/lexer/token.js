"use strict";
/**
 * HKD Token Definitions
 *
 * Every token produced by the lexer carries:
 *  - kind: what type of token it is
 *  - value: the raw source text
 *  - span: precise source location (file, line, column, offset)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEYWORDS = exports.TokenKind = void 0;
exports.isKeyword = isKeyword;
exports.tokenKindName = tokenKindName;
// ─── Token Kinds ─────────────────────────────────────────────────────────────
var TokenKind;
(function (TokenKind) {
    // ── Literals ──────────────────────────────────────────────────────────────
    TokenKind["Int"] = "Int";
    TokenKind["Float"] = "Float";
    TokenKind["String"] = "String";
    TokenKind["Bool"] = "Bool";
    TokenKind["Null"] = "Null";
    // ── Identifier ────────────────────────────────────────────────────────────
    TokenKind["Ident"] = "Ident";
    // ── Keywords ──────────────────────────────────────────────────────────────
    TokenKind["Let"] = "let";
    TokenKind["Const"] = "const";
    TokenKind["Fn"] = "fn";
    TokenKind["Return"] = "return";
    TokenKind["If"] = "if";
    TokenKind["Else"] = "else";
    TokenKind["While"] = "while";
    TokenKind["For"] = "for";
    TokenKind["In"] = "in";
    TokenKind["Break"] = "break";
    TokenKind["Continue"] = "continue";
    TokenKind["Import"] = "import";
    TokenKind["Export"] = "export";
    TokenKind["From"] = "from";
    TokenKind["Struct"] = "struct";
    TokenKind["New"] = "new";
    TokenKind["Self"] = "self";
    TokenKind["Null_kw"] = "null";
    TokenKind["True_kw"] = "true";
    TokenKind["False_kw"] = "false";
    TokenKind["Test"] = "test";
    TokenKind["Assert"] = "assert";
    TokenKind["Type"] = "type";
    TokenKind["As"] = "as";
    TokenKind["Match"] = "match";
    TokenKind["Impl"] = "impl";
    TokenKind["Trait"] = "trait";
    TokenKind["Async"] = "async";
    TokenKind["Await"] = "await";
    TokenKind["Hash"] = "#";
    // ── Arithmetic Operators ──────────────────────────────────────────────────
    TokenKind["Plus"] = "+";
    TokenKind["Minus"] = "-";
    TokenKind["Star"] = "*";
    TokenKind["Slash"] = "/";
    TokenKind["Percent"] = "%";
    TokenKind["StarStar"] = "**";
    // ── Comparison Operators ──────────────────────────────────────────────────
    TokenKind["EqEq"] = "==";
    TokenKind["BangEq"] = "!=";
    TokenKind["Lt"] = "<";
    TokenKind["LtEq"] = "<=";
    TokenKind["Gt"] = ">";
    TokenKind["GtEq"] = ">=";
    // ── Logical Operators ─────────────────────────────────────────────────────
    TokenKind["AmpAmp"] = "&&";
    TokenKind["PipePipe"] = "||";
    TokenKind["Bang"] = "!";
    // ── Bitwise Operators ─────────────────────────────────────────────────────
    TokenKind["Amp"] = "&";
    TokenKind["Pipe"] = "|";
    TokenKind["Caret"] = "^";
    TokenKind["Tilde"] = "~";
    TokenKind["LtLt"] = "<<";
    TokenKind["GtGt"] = ">>";
    // ── Assignment ────────────────────────────────────────────────────────────
    TokenKind["Eq"] = "=";
    TokenKind["PlusEq"] = "+=";
    TokenKind["MinusEq"] = "-=";
    TokenKind["StarEq"] = "*=";
    TokenKind["SlashEq"] = "/=";
    TokenKind["PercentEq"] = "%=";
    // ── Punctuation ───────────────────────────────────────────────────────────
    TokenKind["LParen"] = "(";
    TokenKind["RParen"] = ")";
    TokenKind["LBrace"] = "{";
    TokenKind["RBrace"] = "}";
    TokenKind["LBracket"] = "[";
    TokenKind["RBracket"] = "]";
    TokenKind["Comma"] = ",";
    TokenKind["Dot"] = ".";
    TokenKind["DotDot"] = "..";
    TokenKind["Colon"] = ":";
    TokenKind["ColonColon"] = "::";
    TokenKind["Semicolon"] = ";";
    TokenKind["Arrow"] = "->";
    TokenKind["FatArrow"] = "=>";
    TokenKind["Question"] = "?";
    TokenKind["QuestionDot"] = "?.";
    // ── Special ───────────────────────────────────────────────────────────────
    TokenKind["Newline"] = "Newline";
    TokenKind["Eof"] = "Eof";
    TokenKind["Error"] = "Error";
})(TokenKind || (exports.TokenKind = TokenKind = {}));
// ─── Keyword map ─────────────────────────────────────────────────────────────
exports.KEYWORDS = new Map([
    ["let", TokenKind.Let],
    ["const", TokenKind.Const],
    ["fn", TokenKind.Fn],
    ["return", TokenKind.Return],
    ["if", TokenKind.If],
    ["else", TokenKind.Else],
    ["while", TokenKind.While],
    ["for", TokenKind.For],
    ["in", TokenKind.In],
    ["break", TokenKind.Break],
    ["continue", TokenKind.Continue],
    ["import", TokenKind.Import],
    ["export", TokenKind.Export],
    ["from", TokenKind.From],
    ["struct", TokenKind.Struct],
    ["new", TokenKind.New],
    ["self", TokenKind.Self],
    ["null", TokenKind.Null_kw],
    ["true", TokenKind.True_kw],
    ["false", TokenKind.False_kw],
    ["test", TokenKind.Test],
    ["assert", TokenKind.Assert],
    ["type", TokenKind.Type],
    ["as", TokenKind.As],
    ["match", TokenKind.Match],
    ["impl", TokenKind.Impl],
    ["trait", TokenKind.Trait],
    ["async", TokenKind.Async],
    ["await", TokenKind.Await],
]);
// ─── Helpers ──────────────────────────────────────────────────────────────────
function isKeyword(kind) {
    return [
        TokenKind.Let, TokenKind.Const, TokenKind.Fn, TokenKind.Return,
        TokenKind.If, TokenKind.Else, TokenKind.While, TokenKind.For,
        TokenKind.In, TokenKind.Break, TokenKind.Continue, TokenKind.Import,
        TokenKind.Export, TokenKind.From, TokenKind.Struct, TokenKind.New,
        TokenKind.Self, TokenKind.Null_kw, TokenKind.True_kw, TokenKind.False_kw,
        TokenKind.Test, TokenKind.Assert, TokenKind.Type, TokenKind.As,
        TokenKind.Match, TokenKind.Impl, TokenKind.Trait, TokenKind.Async,
        TokenKind.Await,
    ].includes(kind);
}
function tokenKindName(kind) {
    return kind;
}
//# sourceMappingURL=token.js.map