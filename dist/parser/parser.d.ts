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
import { ErrorReporter } from "../errors/index.js";
import { Token } from "../lexer/token.js";
import * as N from "../ast/nodes.js";
export declare class Parser {
    private tokens;
    private pos;
    private readonly reporter;
    private readonly source;
    private readonly fileName;
    private lastErrorPos;
    private readonly edition;
    private readonly enabledFeatures;
    constructor(tokens: Token[], source: string, fileName: string, reporter: ErrorReporter, edition?: "2026" | "2027");
    isFeatureEnabled(name: string): boolean;
    parse(): N.Program;
    private parseFeatureDirective;
    private parseStatement;
    private parseVarDecl;
    private parseFunctionDecl;
    private parseTypeParams;
    private parseParams;
    private parseStructDecl;
    private parseImpl;
    private parseTraitDecl;
    private parseTypeAlias;
    private parseReturn;
    private parseBreak;
    private parseContinue;
    private parseIfStmt;
    private parseWhile;
    private parseFor;
    private parseBlock;
    private parseImport;
    private parseImportSpecifiers;
    private parseStringLiteralValue;
    private parseExport;
    private parseTest;
    private parseAssertStmt;
    private parseExprStmt;
    private parseTypeExpr;
    private parseExpr;
    private parseUnary;
    private isGenericCall;
    private parsePostfix;
    private parseCallArgs;
    private parsePrimary;
    private parseMatchExpr;
    private parsePattern;
    private parseObjectFields;
    private parseInfix;
    private infixPrec;
    private isRightAssoc;
    private isStructInitContext;
    private peek;
    private peekAt;
    private peekSkippingNewlines;
    private advance;
    private check;
    private checkAny;
    private isAtEnd;
    private expect;
    private expectIdent;
    private skipNewlines;
    private skipStatementTerminators;
    private error;
    /** Skip tokens until a safe restart point after a parse error. */
    private synchronize;
    private startSpan;
    private endSpan;
    private endSpan2;
    private currentEnd;
    private eofToken;
}
export declare function parse(tokens: Token[], source: string, fileName?: string, reporter?: ErrorReporter, edition?: "2026" | "2027"): N.Program;
//# sourceMappingURL=parser.d.ts.map