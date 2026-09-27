/**
 * HKD Token Definitions
 *
 * Every token produced by the lexer carries:
 *  - kind: what type of token it is
 *  - value: the raw source text
 *  - span: precise source location (file, line, column, offset)
 */

import { SourceSpan } from "../errors/index.js";

// ─── Token Kinds ─────────────────────────────────────────────────────────────

export enum TokenKind {
  // ── Literals ──────────────────────────────────────────────────────────────
  Int = "Int",           // 42, 0, 100
  Float = "Float",       // 3.14, 0.5
  String = "String",     // "hello"
  Bool = "Bool",         // true, false
  Null = "Null",         // null

  // ── Identifier ────────────────────────────────────────────────────────────
  Ident = "Ident",       // foo, bar, myVar

  // ── Keywords ──────────────────────────────────────────────────────────────
  Let = "let",
  Const = "const",
  Fn = "fn",
  Return = "return",
  If = "if",
  Else = "else",
  While = "while",
  For = "for",
  In = "in",
  Break = "break",
  Continue = "continue",
  Import = "import",
  Export = "export",
  From = "from",
  Struct = "struct",
  New = "new",
  Self = "self",
  Null_kw = "null",     // null literal keyword
  True_kw = "true",     // true keyword
  False_kw = "false",   // false keyword
  Test = "test",
  Assert = "assert",
  Type = "type",
  As = "as",
  Match = "match",
  Impl = "impl",
  Trait = "trait",
  Async = "async",
  Await = "await",
  Hash = "#",

  // ── Arithmetic Operators ──────────────────────────────────────────────────
  Plus = "+",
  Minus = "-",
  Star = "*",
  Slash = "/",
  Percent = "%",
  StarStar = "**",      // exponentiation

  // ── Comparison Operators ──────────────────────────────────────────────────
  EqEq = "==",
  BangEq = "!=",
  Lt = "<",
  LtEq = "<=",
  Gt = ">",
  GtEq = ">=",

  // ── Logical Operators ─────────────────────────────────────────────────────
  AmpAmp = "&&",
  PipePipe = "||",
  Bang = "!",

  // ── Bitwise Operators ─────────────────────────────────────────────────────
  Amp = "&",
  Pipe = "|",
  Caret = "^",
  Tilde = "~",
  LtLt = "<<",
  GtGt = ">>",

  // ── Assignment ────────────────────────────────────────────────────────────
  Eq = "=",
  PlusEq = "+=",
  MinusEq = "-=",
  StarEq = "*=",
  SlashEq = "/=",
  PercentEq = "%=",

  // ── Punctuation ───────────────────────────────────────────────────────────
  LParen = "(",
  RParen = ")",
  LBrace = "{",
  RBrace = "}",
  LBracket = "[",
  RBracket = "]",
  Comma = ",",
  Dot = ".",
  DotDot = "..",
  Colon = ":",
  ColonColon = "::",
  Semicolon = ";",
  Arrow = "->",
  FatArrow = "=>",
  Question = "?",
  QuestionDot = "?.",

  // ── Special ───────────────────────────────────────────────────────────────
  Newline = "Newline",
  Eof = "Eof",
  Error = "Error",      // lexer error token (recoverable)
}

// ─── Keyword map ─────────────────────────────────────────────────────────────

export const KEYWORDS: ReadonlyMap<string, TokenKind> = new Map([
  ["let",      TokenKind.Let],
  ["const",    TokenKind.Const],
  ["fn",       TokenKind.Fn],
  ["return",   TokenKind.Return],
  ["if",       TokenKind.If],
  ["else",     TokenKind.Else],
  ["while",    TokenKind.While],
  ["for",      TokenKind.For],
  ["in",       TokenKind.In],
  ["break",    TokenKind.Break],
  ["continue", TokenKind.Continue],
  ["import",   TokenKind.Import],
  ["export",   TokenKind.Export],
  ["from",     TokenKind.From],
  ["struct",   TokenKind.Struct],
  ["new",      TokenKind.New],
  ["self",     TokenKind.Self],
  ["null",     TokenKind.Null_kw],
  ["true",     TokenKind.True_kw],
  ["false",    TokenKind.False_kw],
  ["test",     TokenKind.Test],
  ["assert",   TokenKind.Assert],
  ["type",     TokenKind.Type],
  ["as",       TokenKind.As],
  ["match",    TokenKind.Match],
  ["impl",     TokenKind.Impl],
  ["trait",    TokenKind.Trait],
  ["async",    TokenKind.Async],
  ["await",    TokenKind.Await],
]);

// ─── Token ───────────────────────────────────────────────────────────────────

export interface Token {
  kind: TokenKind;
  value: string;       // raw source text of the token
  span: SourceSpan;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function isKeyword(kind: TokenKind): boolean {
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

export function tokenKindName(kind: TokenKind): string {
  return kind;
}
