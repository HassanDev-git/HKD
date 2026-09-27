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
import { ErrorReporter } from "../errors/index.js";
import { Token } from "./token.js";
export declare class Lexer {
    private readonly source;
    private readonly fileName;
    private readonly reporter;
    private pos;
    private line;
    private col;
    constructor(source: string, fileName: string, reporter: ErrorReporter);
    /** Lex the entire source and return all tokens (including EOF). */
    tokenize(): Token[];
    private nextToken;
    private scanNumber;
    private scanIdentOrKeyword;
    private scanString;
    private scanEscapeSequence;
    private scanUnicodeEscape;
    private scanOperatorOrPunct;
    private skipWhitespaceAndComments;
    private peek;
    private peekAt;
    private advance;
    private isAtEnd;
    private currentLocation;
    private spanFrom;
    private makeToken;
    private makeTokenSpan;
}
/**
 * Lex source code and return tokens.
 * Throws if any errors were reported and throwOnError is true.
 */
export declare function lex(source: string, fileName?: string, reporter?: ErrorReporter): Token[];
//# sourceMappingURL=lexer.d.ts.map