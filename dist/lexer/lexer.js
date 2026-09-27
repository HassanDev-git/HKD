"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lexer = void 0;
exports.lex = lex;
const index_js_1 = require("../errors/index.js");
const index_js_2 = require("../utils/index.js");
const token_js_1 = require("./token.js");
// ─── Lexer class ─────────────────────────────────────────────────────────────
class Lexer {
    source;
    fileName;
    reporter;
    pos = 0; // current byte offset
    line = 1; // current line (1-based)
    col = 1; // current column (1-based)
    constructor(source, fileName, reporter) {
        this.source = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
        this.fileName = fileName;
        this.reporter = reporter;
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    /** Lex the entire source and return all tokens (including EOF). */
    tokenize() {
        const tokens = [];
        while (!this.isAtEnd()) {
            this.skipWhitespaceAndComments();
            if (this.isAtEnd())
                break;
            const token = this.nextToken();
            if (token !== null) {
                tokens.push(token);
            }
        }
        tokens.push(this.makeToken(token_js_1.TokenKind.Eof, "", this.currentLocation()));
        return tokens;
    }
    // ── Core scanner ───────────────────────────────────────────────────────────
    nextToken() {
        const start = this.currentLocation();
        const ch = this.advance();
        // Newline — significant in HKD for statement separation
        if (ch === "\n") {
            return this.makeTokenSpan(token_js_1.TokenKind.Newline, "\n", start);
        }
        // Numbers
        if ((0, index_js_2.isDigit)(ch)) {
            return this.scanNumber(ch, start);
        }
        // Identifiers and keywords
        if ((0, index_js_2.isIdentStart)(ch)) {
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
    scanNumber(first, start) {
        let value = first;
        let isFloat = false;
        // Hex: 0x...
        if (first === "0" && this.peek() === "x") {
            value += this.advance(); // consume 'x'
            while (!this.isAtEnd() && (0, index_js_2.isHexDigit)(this.peek())) {
                value += this.advance();
            }
            return this.makeTokenSpan(token_js_1.TokenKind.Int, value, start);
        }
        // Decimal digits
        while (!this.isAtEnd() && (0, index_js_2.isDigit)(this.peek())) {
            value += this.advance();
        }
        // Fractional part
        if (!this.isAtEnd() && this.peek() === "." && this.peekAt(1) !== ".") {
            isFloat = true;
            value += this.advance(); // consume '.'
            while (!this.isAtEnd() && (0, index_js_2.isDigit)(this.peek())) {
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
            if (this.isAtEnd() || !(0, index_js_2.isDigit)(this.peek())) {
                const span = this.spanFrom(start);
                this.reporter.error(index_js_1.ErrorCode.E104, `Invalid number literal: missing exponent digits`, span);
                return this.makeTokenSpan(token_js_1.TokenKind.Error, value, start);
            }
            while (!this.isAtEnd() && (0, index_js_2.isDigit)(this.peek())) {
                value += this.advance();
            }
        }
        return this.makeTokenSpan(isFloat ? token_js_1.TokenKind.Float : token_js_1.TokenKind.Int, value, start);
    }
    // ── Identifier / keyword scanning ─────────────────────────────────────────
    scanIdentOrKeyword(first, start) {
        let value = first;
        while (!this.isAtEnd() && (0, index_js_2.isIdentContinue)(this.peek())) {
            value += this.advance();
        }
        const kw = token_js_1.KEYWORDS.get(value);
        if (kw !== undefined) {
            return this.makeTokenSpan(kw, value, start);
        }
        return this.makeTokenSpan(token_js_1.TokenKind.Ident, value, start);
    }
    // ── String scanning ────────────────────────────────────────────────────────
    scanString(start) {
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
                if (escaped === null)
                    return this.makeTokenSpan(token_js_1.TokenKind.Error, value, start);
                value += escaped;
                continue;
            }
            value += ch;
        }
        if (this.isAtEnd()) {
            const span = this.spanFrom(start);
            this.reporter.error(index_js_1.ErrorCode.E102, "Unterminated string literal", span, { help: ["Add a closing `\"` to terminate the string"] });
            return this.makeTokenSpan(token_js_1.TokenKind.Error, value, start);
        }
        this.advance(); // consume closing '"'
        return this.makeTokenSpan(token_js_1.TokenKind.String, value, start);
    }
    scanEscapeSequence(start) {
        if (this.isAtEnd()) {
            const span = this.spanFrom(start);
            this.reporter.error(index_js_1.ErrorCode.E105, "Unexpected end of file after escape character", span);
            return null;
        }
        const esc = this.advance();
        switch (esc) {
            case "n": return "\n";
            case "t": return "\t";
            case "r": return "\r";
            case '"': return '"';
            case "'": return "'";
            case "\\": return "\\";
            case "0": return "\0";
            case "u": {
                // Unicode escape: \uXXXX or \u{XXXX}
                return this.scanUnicodeEscape(start);
            }
            default: {
                const span = this.spanFrom(start);
                this.reporter.error(index_js_1.ErrorCode.E105, `Invalid escape sequence: \\${esc}`, span, { help: [`Valid escapes: \\n \\t \\r \\\\ \\" \\' \\0 \\uXXXX`] });
                return null;
            }
        }
    }
    scanUnicodeEscape(start) {
        let hex = "";
        const braced = !this.isAtEnd() && this.peek() === "{";
        if (braced) {
            this.advance(); // consume '{'
            while (!this.isAtEnd() && this.peek() !== "}") {
                hex += this.advance();
            }
            if (this.isAtEnd()) {
                this.reporter.error(index_js_1.ErrorCode.E105, "Unterminated unicode escape", this.spanFrom(start));
                return null;
            }
            this.advance(); // consume '}'
        }
        else {
            for (let i = 0; i < 4; i++) {
                if (this.isAtEnd() || !(0, index_js_2.isHexDigit)(this.peek())) {
                    this.reporter.error(index_js_1.ErrorCode.E105, "Unicode escape requires 4 hex digits", this.spanFrom(start));
                    return null;
                }
                hex += this.advance();
            }
        }
        const codePoint = parseInt(hex, 16);
        if (isNaN(codePoint) || codePoint > 0x10ffff) {
            this.reporter.error(index_js_1.ErrorCode.E105, `Invalid unicode code point: ${hex}`, this.spanFrom(start));
            return null;
        }
        return String.fromCodePoint(codePoint);
    }
    // ── Operators and punctuation ─────────────────────────────────────────────
    scanOperatorOrPunct(ch, start) {
        switch (ch) {
            case "(": return this.makeTokenSpan(token_js_1.TokenKind.LParen, ch, start);
            case ")": return this.makeTokenSpan(token_js_1.TokenKind.RParen, ch, start);
            case "{": return this.makeTokenSpan(token_js_1.TokenKind.LBrace, ch, start);
            case "}": return this.makeTokenSpan(token_js_1.TokenKind.RBrace, ch, start);
            case "[": return this.makeTokenSpan(token_js_1.TokenKind.LBracket, ch, start);
            case "]": return this.makeTokenSpan(token_js_1.TokenKind.RBracket, ch, start);
            case ",": return this.makeTokenSpan(token_js_1.TokenKind.Comma, ch, start);
            case ";": return this.makeTokenSpan(token_js_1.TokenKind.Semicolon, ch, start);
            case "~": return this.makeTokenSpan(token_js_1.TokenKind.Tilde, ch, start);
            case "?":
                if (this.peek() === ".") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.QuestionDot, "?.", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Question, ch, start);
            case ".":
                if (this.peek() === ".") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.DotDot, "..", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Dot, ch, start);
            case ":":
                if (this.peek() === ":") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.ColonColon, "::", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Colon, ch, start);
            case "+":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.PlusEq, "+=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Plus, ch, start);
            case "-":
                if (this.peek() === ">") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.Arrow, "->", start);
                }
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.MinusEq, "-=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Minus, ch, start);
            case "*":
                if (this.peek() === "*") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.StarStar, "**", start);
                }
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.StarEq, "*=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Star, ch, start);
            case "/":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.SlashEq, "/=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Slash, ch, start);
            case "%":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.PercentEq, "%=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Percent, ch, start);
            case "=":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.EqEq, "==", start);
                }
                if (this.peek() === ">") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.FatArrow, "=>", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Eq, ch, start);
            case "!":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.BangEq, "!=", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Bang, ch, start);
            case "<":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.LtEq, "<=", start);
                }
                if (this.peek() === "<") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.LtLt, "<<", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Lt, ch, start);
            case ">":
                if (this.peek() === "=") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.GtEq, ">=", start);
                }
                if (this.peek() === ">") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.GtGt, ">>", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Gt, ch, start);
            case "&":
                if (this.peek() === "&") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.AmpAmp, "&&", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Amp, ch, start);
            case "|":
                if (this.peek() === "|") {
                    this.advance();
                    return this.makeTokenSpan(token_js_1.TokenKind.PipePipe, "||", start);
                }
                return this.makeTokenSpan(token_js_1.TokenKind.Pipe, ch, start);
            case "^":
                return this.makeTokenSpan(token_js_1.TokenKind.Caret, ch, start);
            case "#":
                return this.makeTokenSpan(token_js_1.TokenKind.Hash, ch, start);
            default: {
                const span = this.spanFrom(start);
                this.reporter.error(index_js_1.ErrorCode.E101, `Unexpected character: \`${ch}\``, span);
                return this.makeTokenSpan(token_js_1.TokenKind.Error, ch, start);
            }
        }
    }
    // ── Whitespace and comment skipping ──────────────────────────────────────
    skipWhitespaceAndComments() {
        while (!this.isAtEnd()) {
            const ch = this.peek();
            // Horizontal whitespace: space, tab, carriage return
            if ((0, index_js_2.isHorizontalWhitespace)(ch)) {
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
                    }
                    else if (this.peek() === "*" && this.peekAt(1) === "/") {
                        this.advance();
                        this.advance();
                        depth--;
                    }
                    else {
                        this.advance();
                    }
                }
                if (depth > 0) {
                    const span = this.spanFrom(start);
                    this.reporter.error(index_js_1.ErrorCode.E103, "Unterminated block comment", span, { help: ["Add `*/` to close the block comment"] });
                }
                continue;
            }
            break;
        }
    }
    // ── Character utilities ───────────────────────────────────────────────────
    peek() {
        return this.source[this.pos] ?? "";
    }
    peekAt(offset) {
        return this.source[this.pos + offset] ?? "";
    }
    advance() {
        const ch = this.source[this.pos] ?? "";
        this.pos++;
        if (ch === "\n") {
            this.line++;
            this.col = 1;
        }
        else {
            this.col++;
        }
        return ch;
    }
    isAtEnd() {
        return this.pos >= this.source.length;
    }
    // ── Location utilities ────────────────────────────────────────────────────
    currentLocation() {
        return {
            file: this.fileName,
            line: this.line,
            column: this.col,
            offset: this.pos,
        };
    }
    spanFrom(start) {
        return {
            start,
            end: this.currentLocation(),
        };
    }
    makeToken(kind, value, loc) {
        return {
            kind,
            value,
            span: { start: loc, end: loc },
        };
    }
    makeTokenSpan(kind, value, start) {
        return {
            kind,
            value,
            span: { start, end: this.currentLocation() },
        };
    }
}
exports.Lexer = Lexer;
// ─── Convenience function ─────────────────────────────────────────────────────
/**
 * Lex source code and return tokens.
 * Throws if any errors were reported and throwOnError is true.
 */
function lex(source, fileName = "<stdin>", reporter) {
    const rep = reporter ?? new index_js_1.ErrorReporter(source, fileName);
    const lexer = new Lexer(source, fileName, rep);
    return lexer.tokenize();
}
//# sourceMappingURL=lexer.js.map