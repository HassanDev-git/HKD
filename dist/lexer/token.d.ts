/**
 * HKD Token Definitions
 *
 * Every token produced by the lexer carries:
 *  - kind: what type of token it is
 *  - value: the raw source text
 *  - span: precise source location (file, line, column, offset)
 */
import { SourceSpan } from "../errors/index.js";
export declare enum TokenKind {
    Int = "Int",// 42, 0, 100
    Float = "Float",// 3.14, 0.5
    String = "String",// "hello"
    Bool = "Bool",// true, false
    Null = "Null",// null
    Ident = "Ident",// foo, bar, myVar
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
    Null_kw = "null",// null literal keyword
    True_kw = "true",// true keyword
    False_kw = "false",// false keyword
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
    Plus = "+",
    Minus = "-",
    Star = "*",
    Slash = "/",
    Percent = "%",
    StarStar = "**",// exponentiation
    EqEq = "==",
    BangEq = "!=",
    Lt = "<",
    LtEq = "<=",
    Gt = ">",
    GtEq = ">=",
    AmpAmp = "&&",
    PipePipe = "||",
    Bang = "!",
    Amp = "&",
    Pipe = "|",
    Caret = "^",
    Tilde = "~",
    LtLt = "<<",
    GtGt = ">>",
    Eq = "=",
    PlusEq = "+=",
    MinusEq = "-=",
    StarEq = "*=",
    SlashEq = "/=",
    PercentEq = "%=",
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
    Newline = "Newline",
    Eof = "Eof",
    Error = "Error"
}
export declare const KEYWORDS: ReadonlyMap<string, TokenKind>;
export interface Token {
    kind: TokenKind;
    value: string;
    span: SourceSpan;
}
export declare function isKeyword(kind: TokenKind): boolean;
export declare function tokenKindName(kind: TokenKind): string;
//# sourceMappingURL=token.d.ts.map