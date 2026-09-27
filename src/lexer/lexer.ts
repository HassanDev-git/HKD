/**
 * HKD Lexer
 *
 * Converts raw HKD source text into a flat list of Tokens.
 *
 * Features:
 *   - Full source-location tracking (file, line, column, offset)
 *   - All HKD token kinds
 *   - Line comments (//)
 *   - Block comments (/* ... *\/)
 *   - String escape sequences
 *   - Integer and float literals
 *   - Recoverable error tokens
 */

import {
  ErrorCode,
  ErrorReporter,
  SourceLocation,
  SourceSpan,
} from "../errors/index.js";
import {
  isAlpha,
  isDigit,
  isHexDigit,
  isIdentContinue,
  isIdentStart,
  isHorizontalWhitespace,
} from "../utils/index.js";
import { KEYWORDS, Token, TokenKind } from "./token.js";

// ─── Lexer class ─────────────────────────────────────────────────────────────

export class Lexer {
  private readonly source: string;
  private readonly fileName: string;
  private readonly reporter: ErrorReporter;

  private pos: number = 0;    // current byte offset
  private line: number = 1;   // current line (1-based)
  private col: number = 1;    // current column (1-based)

  constructor(source: string, fileName: string, reporter: ErrorReporter) {
    this.source = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
    this.fileName = fileName;
    this.reporter = reporter;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Lex the entire source and return all tokens (including EOF). */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespaceAndComments();
      if (this.isAtEnd()) break;

      const token = this.nextToken();
      if (token !== null) {
        tokens.push(token);
      }
    }

    tokens.push(this.makeToken(TokenKind.Eof, "", this.currentLocation()));
    return tokens;
  }

  // ── Core scanner ───────────────────────────────────────────────────────────

  private nextToken(): Token | null {
    const start = this.currentLocation();
    const ch = this.advance();

    // Newline — significant in HKD for statement separation
    if (ch === "\n") {
      return this.makeTokenSpan(TokenKind.Newline, "\n", start);
    }

    // Numbers
    if (isDigit(ch)) {
      return this.scanNumber(ch, start);
    }

    // Identifiers and keywords
    if (isIdentStart(ch)) {
      return this.scanIdentOrKeyword(ch, start);
    }

    // Strings
    if (ch === '"') {
      return this.scanString(start);
    }

    // Operators and punctuation
    return this.scanOperatorOrPunct(ch, start);
  }

  // ── Number scanning ────────────────────────────────────────────────────────

  private scanNumber(first: string, start: SourceLocation): Token {
    let value = first;
    let isFloat = false;

    // Hex: 0x...
    if (first === "0" && this.peek() === "x") {
      value += this.advance(); // consume 'x'
      while (!this.isAtEnd() && isHexDigit(this.peek())) {
        value += this.advance();
      }
      return this.makeTokenSpan(TokenKind.Int, value, start);
    }

    // Decimal digits
    while (!this.isAtEnd() && isDigit(this.peek())) {
      value += this.advance();
    }

    // Fractional part
    if (!this.isAtEnd() && this.peek() === "." && this.peekAt(1) !== ".") {
      isFloat = true;
      value += this.advance(); // consume '.'
      while (!this.isAtEnd() && isDigit(this.peek())) {
        value += this.advance();
      }
    }

    // Exponent part: e+10, e-5, e3
    if (!this.isAtEnd() && (this.peek() === "e" || this.peek() === "E")) {
      isFloat = true;
      value += this.advance();
      if (!this.isAtEnd() && (this.peek() === "+" || this.peek() === "-")) {
        value += this.advance();
      }
      if (this.isAtEnd() || !isDigit(this.peek())) {
        const span = this.spanFrom(start);
        this.reporter.error(
          ErrorCode.E104,
          `Invalid number literal: missing exponent digits`,
          span
        );
        return this.makeTokenSpan(TokenKind.Error, value, start);
      }
      while (!this.isAtEnd() && isDigit(this.peek())) {
        value += this.advance();
      }
    }

    return this.makeTokenSpan(isFloat ? TokenKind.Float : TokenKind.Int, value, start);
  }

  // ── Identifier / keyword scanning ─────────────────────────────────────────

  private scanIdentOrKeyword(first: string, start: SourceLocation): Token {
    let value = first;
    while (!this.isAtEnd() && isIdentContinue(this.peek())) {
      value += this.advance();
    }

    const kw = KEYWORDS.get(value);
    if (kw !== undefined) {
      return this.makeTokenSpan(kw, value, start);
    }
    return this.makeTokenSpan(TokenKind.Ident, value, start);
  }

  // ── String scanning ────────────────────────────────────────────────────────

  private scanString(start: SourceLocation): Token {
    let value = "";

    while (!this.isAtEnd() && this.peek() !== '"') {
      const ch = this.advance();

      if (ch === "\n") {
        // Newlines inside strings are allowed in HKD but tracked
        value += ch;
        continue;
      }

      if (ch === "\\") {
        const escaped = this.scanEscapeSequence(start);
        if (escaped === null) return this.makeTokenSpan(TokenKind.Error, value, start);
        value += escaped;
        continue;
      }

      value += ch;
    }

    if (this.isAtEnd()) {
      const span = this.spanFrom(start);
      this.reporter.error(
        ErrorCode.E102,
        "Unterminated string literal",
        span,
        { help: ["Add a closing `\"` to terminate the string"] }
      );
      return this.makeTokenSpan(TokenKind.Error, value, start);
    }

    this.advance(); // consume closing '"'
    return this.makeTokenSpan(TokenKind.String, value, start);
  }

  private scanEscapeSequence(start: SourceLocation): string | null {
    if (this.isAtEnd()) {
      const span = this.spanFrom(start);
      this.reporter.error(
        ErrorCode.E105,
        "Unexpected end of file after escape character",
        span
      );
      return null;
    }

    const esc = this.advance();
    switch (esc) {
      case "n":  return "\n";
      case "t":  return "\t";
      case "r":  return "\r";
      case '"':  return '"';
      case "'":  return "'";
      case "\\": return "\\";
      case "0":  return "\0";
      case "u": {
        // Unicode escape: \uXXXX or \u{XXXX}
        return this.scanUnicodeEscape(start);
      }
      default: {
        const span = this.spanFrom(start);
        this.reporter.error(
          ErrorCode.E105,
          `Invalid escape sequence: \\${esc}`,
          span,
          { help: [`Valid escapes: \\n \\t \\r \\\\ \\" \\' \\0 \\uXXXX`] }
        );
        return null;
      }
    }
  }

  private scanUnicodeEscape(start: SourceLocation): string | null {
    let hex = "";
    const braced = !this.isAtEnd() && this.peek() === "{";

    if (braced) {
      this.advance(); // consume '{'
      while (!this.isAtEnd() && this.peek() !== "}") {
        hex += this.advance();
      }
      if (this.isAtEnd()) {
        this.reporter.error(ErrorCode.E105, "Unterminated unicode escape", this.spanFrom(start));
        return null;
      }
      this.advance(); // consume '}'
    } else {
      for (let i = 0; i < 4; i++) {
        if (this.isAtEnd() || !isHexDigit(this.peek())) {
          this.reporter.error(ErrorCode.E105, "Unicode escape requires 4 hex digits", this.spanFrom(start));
          return null;
        }
        hex += this.advance();
      }
    }

    const codePoint = parseInt(hex, 16);
    if (isNaN(codePoint) || codePoint > 0x10ffff) {
      this.reporter.error(ErrorCode.E105, `Invalid unicode code point: ${hex}`, this.spanFrom(start));
      return null;
    }
    return String.fromCodePoint(codePoint);
  }

  // ── Operators and punctuation ─────────────────────────────────────────────

  private scanOperatorOrPunct(ch: string, start: SourceLocation): Token {
    switch (ch) {
      case "(": return this.makeTokenSpan(TokenKind.LParen, ch, start);
      case ")": return this.makeTokenSpan(TokenKind.RParen, ch, start);
      case "{": return this.makeTokenSpan(TokenKind.LBrace, ch, start);
      case "}": return this.makeTokenSpan(TokenKind.RBrace, ch, start);
      case "[": return this.makeTokenSpan(TokenKind.LBracket, ch, start);
      case "]": return this.makeTokenSpan(TokenKind.RBracket, ch, start);
      case ",": return this.makeTokenSpan(TokenKind.Comma, ch, start);
      case ";": return this.makeTokenSpan(TokenKind.Semicolon, ch, start);
      case "~": return this.makeTokenSpan(TokenKind.Tilde, ch, start);
      case "?":
        if (this.peek() === ".") {
          this.advance();
          return this.makeTokenSpan(TokenKind.QuestionDot, "?.", start);
        }
        return this.makeTokenSpan(TokenKind.Question, ch, start);
      case ".":
        if (this.peek() === ".") {
          this.advance();
          return this.makeTokenSpan(TokenKind.DotDot, "..", start);
        }
        return this.makeTokenSpan(TokenKind.Dot, ch, start);
      case ":":
        if (this.peek() === ":") {
          this.advance();
          return this.makeTokenSpan(TokenKind.ColonColon, "::", start);
        }
        return this.makeTokenSpan(TokenKind.Colon, ch, start);
      case "+":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.PlusEq, "+=", start); }
        return this.makeTokenSpan(TokenKind.Plus, ch, start);
      case "-":
        if (this.peek() === ">") { this.advance(); return this.makeTokenSpan(TokenKind.Arrow, "->", start); }
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.MinusEq, "-=", start); }
        return this.makeTokenSpan(TokenKind.Minus, ch, start);
      case "*":
        if (this.peek() === "*") { this.advance(); return this.makeTokenSpan(TokenKind.StarStar, "**", start); }
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.StarEq, "*=", start); }
        return this.makeTokenSpan(TokenKind.Star, ch, start);
      case "/":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.SlashEq, "/=", start); }
        return this.makeTokenSpan(TokenKind.Slash, ch, start);
      case "%":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.PercentEq, "%=", start); }
        return this.makeTokenSpan(TokenKind.Percent, ch, start);
      case "=":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.EqEq, "==", start); }
        if (this.peek() === ">") { this.advance(); return this.makeTokenSpan(TokenKind.FatArrow, "=>", start); }
        return this.makeTokenSpan(TokenKind.Eq, ch, start);
      case "!":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.BangEq, "!=", start); }
        return this.makeTokenSpan(TokenKind.Bang, ch, start);
      case "<":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.LtEq, "<=", start); }
        if (this.peek() === "<") { this.advance(); return this.makeTokenSpan(TokenKind.LtLt, "<<", start); }
        return this.makeTokenSpan(TokenKind.Lt, ch, start);
      case ">":
        if (this.peek() === "=") { this.advance(); return this.makeTokenSpan(TokenKind.GtEq, ">=", start); }
        if (this.peek() === ">") { this.advance(); return this.makeTokenSpan(TokenKind.GtGt, ">>", start); }
        return this.makeTokenSpan(TokenKind.Gt, ch, start);
      case "&":
        if (this.peek() === "&") { this.advance(); return this.makeTokenSpan(TokenKind.AmpAmp, "&&", start); }
        return this.makeTokenSpan(TokenKind.Amp, ch, start);
      case "|":
        if (this.peek() === "|") { this.advance(); return this.makeTokenSpan(TokenKind.PipePipe, "||", start); }
        return this.makeTokenSpan(TokenKind.Pipe, ch, start);
      case "^":
        return this.makeTokenSpan(TokenKind.Caret, ch, start);
      case "#":
        return this.makeTokenSpan(TokenKind.Hash, ch, start);
      default: {
        const span = this.spanFrom(start);
        this.reporter.error(
          ErrorCode.E101,
          `Unexpected character: \`${ch}\``,
          span
        );
        return this.makeTokenSpan(TokenKind.Error, ch, start);
      }
    }
  }

  // ── Whitespace and comment skipping ──────────────────────────────────────

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const ch = this.peek();

      // Horizontal whitespace: space, tab, carriage return
      if (isHorizontalWhitespace(ch)) {
        this.advance();
        continue;
      }

      // Line comment: // until end of line
      if (ch === "/" && this.peekAt(1) === "/") {
        this.advance(); // /
        this.advance(); // /
        while (!this.isAtEnd() && this.peek() !== "\n") {
          this.advance();
        }
        continue;
      }

      // Block comment: /* ... */
      if (ch === "/" && this.peekAt(1) === "*") {
        const start = this.currentLocation();
        this.advance(); // /
        this.advance(); // *
        let depth = 1;

        while (!this.isAtEnd() && depth > 0) {
          if (this.peek() === "/" && this.peekAt(1) === "*") {
            this.advance();
            this.advance();
            depth++;
          } else if (this.peek() === "*" && this.peekAt(1) === "/") {
            this.advance();
            this.advance();
            depth--;
          } else {
            this.advance();
          }
        }

        if (depth > 0) {
          const span = this.spanFrom(start);
          this.reporter.error(
            ErrorCode.E103,
            "Unterminated block comment",
            span,
            { help: ["Add `*/` to close the block comment"] }
          );
        }
        continue;
      }

      break;
    }
  }

  // ── Character utilities ───────────────────────────────────────────────────

  private peek(): string {
    return this.source[this.pos] ?? "";
  }

  private peekAt(offset: number): string {
    return this.source[this.pos + offset] ?? "";
  }

  private advance(): string {
    const ch = this.source[this.pos] ?? "";
    this.pos++;
    if (ch === "\n") {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  }

  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  // ── Location utilities ────────────────────────────────────────────────────

  private currentLocation(): SourceLocation {
    return {
      file: this.fileName,
      line: this.line,
      column: this.col,
      offset: this.pos,
    };
  }

  private spanFrom(start: SourceLocation): SourceSpan {
    return {
      start,
      end: this.currentLocation(),
    };
  }

  private makeToken(
    kind: TokenKind,
    value: string,
    loc: SourceLocation
  ): Token {
    return {
      kind,
      value,
      span: { start: loc, end: loc },
    };
  }

  private makeTokenSpan(
    kind: TokenKind,
    value: string,
    start: SourceLocation
  ): Token {
    return {
      kind,
      value,
      span: { start, end: this.currentLocation() },
    };
  }
}

// ─── Convenience function ─────────────────────────────────────────────────────

/**
 * Lex source code and return tokens.
 * Throws if any errors were reported and throwOnError is true.
 */
export function lex(
  source: string,
  fileName = "<stdin>",
  reporter?: ErrorReporter
): Token[] {
  const rep = reporter ?? new ErrorReporter(source, fileName);
  const lexer = new Lexer(source, fileName, rep);
  return lexer.tokenize();
}
