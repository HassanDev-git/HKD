/**
 * Lexer Test Suite
 */

import { Lexer } from "../../src/lexer/lexer";
import { TokenKind } from "../../src/lexer/token";
import { ErrorReporter } from "../../src/errors/index";

function lex(source: string) {
  const reporter = new ErrorReporter(source, "<test>");
  const lexer = new Lexer(source, "<test>", reporter);
  const tokens = lexer.tokenize();
  return { tokens, reporter };
}

function kinds(source: string): TokenKind[] {
  const { tokens } = lex(source);
  return tokens.map((t) => t.kind);
}

function values(source: string): string[] {
  const { tokens } = lex(source);
  return tokens.map((t) => t.value);
}

describe("Lexer — Identifiers", () => {
  test("single identifier", () => {
    expect(kinds("foo")).toEqual([TokenKind.Ident, TokenKind.Eof]);
  });

  test("identifier with underscore", () => {
    const { tokens } = lex("_my_var");
    expect(tokens[0].kind).toBe(TokenKind.Ident);
    expect(tokens[0].value).toBe("_my_var");
  });

  test("identifier with digits", () => {
    const { tokens } = lex("foo123");
    expect(tokens[0].kind).toBe(TokenKind.Ident);
    expect(tokens[0].value).toBe("foo123");
  });

  test("uppercase identifier", () => {
    const { tokens } = lex("MyStruct");
    expect(tokens[0].kind).toBe(TokenKind.Ident);
    expect(tokens[0].value).toBe("MyStruct");
  });
});

describe("Lexer — Keywords", () => {
  const keywords: [string, TokenKind][] = [
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
    ["struct",   TokenKind.Struct],
    ["null",     TokenKind.Null_kw],
    ["true",     TokenKind.True_kw],
    ["false",    TokenKind.False_kw],
  ];

  for (const [kw, kind] of keywords) {
    test(`keyword: ${kw}`, () => {
      const { tokens } = lex(kw);
      expect(tokens[0].kind).toBe(kind);
    });
  }
});

describe("Lexer — Integer Literals", () => {
  test("single digit", () => {
    const { tokens } = lex("5");
    expect(tokens[0].kind).toBe(TokenKind.Int);
    expect(tokens[0].value).toBe("5");
  });

  test("multi-digit integer", () => {
    const { tokens } = lex("12345");
    expect(tokens[0].kind).toBe(TokenKind.Int);
    expect(tokens[0].value).toBe("12345");
  });

  test("zero", () => {
    const { tokens } = lex("0");
    expect(tokens[0].kind).toBe(TokenKind.Int);
    expect(tokens[0].value).toBe("0");
  });

  test("hex literal", () => {
    const { tokens } = lex("0xFF");
    expect(tokens[0].kind).toBe(TokenKind.Int);
    expect(tokens[0].value).toBe("0xFF");
  });
});

describe("Lexer — Float Literals", () => {
  test("basic float", () => {
    const { tokens } = lex("3.14");
    expect(tokens[0].kind).toBe(TokenKind.Float);
    expect(tokens[0].value).toBe("3.14");
  });

  test("float with exponent", () => {
    const { tokens } = lex("1.5e10");
    expect(tokens[0].kind).toBe(TokenKind.Float);
    expect(tokens[0].value).toBe("1.5e10");
  });

  test("float with negative exponent", () => {
    const { tokens } = lex("2.5e-3");
    expect(tokens[0].kind).toBe(TokenKind.Float);
  });

  test("integer followed by range (..) is not float", () => {
    const { tokens } = lex("5..10");
    expect(tokens[0].kind).toBe(TokenKind.Int);
    expect(tokens[1].kind).toBe(TokenKind.DotDot);
    expect(tokens[2].kind).toBe(TokenKind.Int);
  });
});

describe("Lexer — String Literals", () => {
  test("empty string", () => {
    const { tokens } = lex('""');
    expect(tokens[0].kind).toBe(TokenKind.String);
    expect(tokens[0].value).toBe("");
  });

  test("simple string", () => {
    const { tokens } = lex('"hello"');
    expect(tokens[0].kind).toBe(TokenKind.String);
    expect(tokens[0].value).toBe("hello");
  });

  test("string with escape sequences", () => {
    const { tokens } = lex('"hello\\nworld"');
    expect(tokens[0].value).toBe("hello\nworld");
  });

  test("string with tab escape", () => {
    const { tokens } = lex('"a\\tb"');
    expect(tokens[0].value).toBe("a\tb");
  });

  test("string with quote escape", () => {
    const { tokens } = lex('"say \\"hello\\""');
    expect(tokens[0].value).toBe('say "hello"');
  });

  test("unterminated string reports error", () => {
    const { reporter } = lex('"unterminated');
    expect(reporter.hasErrors()).toBe(true);
  });
});

describe("Lexer — Operators", () => {
  const ops: [string, TokenKind][] = [
    ["+",  TokenKind.Plus],
    ["-",  TokenKind.Minus],
    ["*",  TokenKind.Star],
    ["/",  TokenKind.Slash],
    ["%",  TokenKind.Percent],
    ["**", TokenKind.StarStar],
    ["==", TokenKind.EqEq],
    ["!=", TokenKind.BangEq],
    ["<",  TokenKind.Lt],
    ["<=", TokenKind.LtEq],
    [">",  TokenKind.Gt],
    [">=", TokenKind.GtEq],
    ["&&", TokenKind.AmpAmp],
    ["||", TokenKind.PipePipe],
    ["!",  TokenKind.Bang],
    ["=",  TokenKind.Eq],
    ["+=", TokenKind.PlusEq],
    ["-=", TokenKind.MinusEq],
    ["*=", TokenKind.StarEq],
    ["/=", TokenKind.SlashEq],
    ["->", TokenKind.Arrow],
    ["=>", TokenKind.FatArrow],
    ["..", TokenKind.DotDot],
    ["::", TokenKind.ColonColon],
    ["?.", TokenKind.QuestionDot],
  ];

  for (const [op, kind] of ops) {
    test(`operator: ${op}`, () => {
      const { tokens } = lex(op);
      expect(tokens[0].kind).toBe(kind);
    });
  }
});

describe("Lexer — Punctuation", () => {
  test("parens and braces", () => {
    const k = kinds("(){}[]");
    expect(k).toEqual([
      TokenKind.LParen, TokenKind.RParen,
      TokenKind.LBrace, TokenKind.RBrace,
      TokenKind.LBracket, TokenKind.RBracket,
      TokenKind.Eof,
    ]);
  });

  test("comma dot colon semicolon", () => {
    const k = kinds(",.;:");
    expect(k).toEqual([
      TokenKind.Comma, TokenKind.Dot,
      TokenKind.Semicolon, TokenKind.Colon,
      TokenKind.Eof,
    ]);
  });
});

describe("Lexer — Comments", () => {
  test("line comment is skipped", () => {
    const k = kinds("// this is a comment\nfoo");
    expect(k[0]).toBe(TokenKind.Newline);
    expect(k[1]).toBe(TokenKind.Ident);
  });

  test("block comment is skipped", () => {
    const k = kinds("/* comment */ foo");
    expect(k[0]).toBe(TokenKind.Ident);
    expect(k[0]).not.toBe(TokenKind.Slash);
  });

  test("nested block comment", () => {
    const { tokens, reporter } = lex("/* outer /* inner */ still outer */ foo");
    expect(reporter.hasErrors()).toBe(false);
    const ident = tokens.find((t) => t.kind === TokenKind.Ident);
    expect(ident?.value).toBe("foo");
  });

  test("unterminated block comment reports error", () => {
    const { reporter } = lex("/* not closed");
    expect(reporter.hasErrors()).toBe(true);
  });
});

describe("Lexer — Source Locations", () => {
  test("line and column tracking", () => {
    const { tokens } = lex("foo\nbar");
    const foo = tokens.find((t) => t.value === "foo")!;
    const bar = tokens.find((t) => t.value === "bar")!;
    expect(foo.span.start.line).toBe(1);
    expect(foo.span.start.column).toBe(1);
    expect(bar.span.start.line).toBe(2);
    expect(bar.span.start.column).toBe(1);
  });

  test("column increments", () => {
    const { tokens } = lex("  foo");
    const foo = tokens.find((t) => t.value === "foo")!;
    expect(foo.span.start.column).toBe(3);
  });

  test("offset tracking", () => {
    const { tokens } = lex("abc");
    const tok = tokens[0];
    expect(tok.span.start.offset).toBe(0);
  });
});

describe("Lexer — Newlines", () => {
  test("newline is its own token", () => {
    const k = kinds("a\nb");
    expect(k).toContain(TokenKind.Newline);
  });

  test("multiple newlines are multiple tokens", () => {
    const k = kinds("a\n\nb");
    const newlines = k.filter((k) => k === TokenKind.Newline);
    expect(newlines.length).toBe(2);
  });
});

describe("Lexer — Error Recovery", () => {
  test("invalid character produces error token", () => {
    const { tokens, reporter } = lex("foo @ bar");
    expect(reporter.hasErrors()).toBe(true);
    const errToken = tokens.find((t) => t.kind === TokenKind.Error);
    expect(errToken).toBeDefined();
  });

  test("lexer continues after error", () => {
    const { tokens } = lex("foo @ bar");
    const idents = tokens.filter((t) => t.kind === TokenKind.Ident);
    expect(idents.length).toBe(2);
    expect(idents[0].value).toBe("foo");
    expect(idents[1].value).toBe("bar");
  });
});
