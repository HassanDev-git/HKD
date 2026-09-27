"use strict";
/**
 * HKD LSP Semantic Tokens Provider
 *
 * Implements LSP 3.17 textDocument/semanticTokens/full by walking the compiler AST
 * and encoding semantic token deltas.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HKD_SEMANTIC_LEGEND = exports.SEMANTIC_TOKEN_MODIFIERS = exports.SEMANTIC_TOKEN_TYPES = void 0;
exports.computeSemanticTokens = computeSemanticTokens;
exports.SEMANTIC_TOKEN_TYPES = [
    "keyword",
    "variable",
    "parameter",
    "function",
    "struct",
    "type",
    "property",
    "module",
    "string",
    "number",
    "operator",
];
exports.SEMANTIC_TOKEN_MODIFIERS = [
    "declaration",
    "readonly",
    "defaultLibrary",
];
exports.HKD_SEMANTIC_LEGEND = {
    tokenTypes: exports.SEMANTIC_TOKEN_TYPES,
    tokenModifiers: exports.SEMANTIC_TOKEN_MODIFIERS,
};
function computeSemanticTokens(doc) {
    if (!doc.ast) {
        return { data: [] };
    }
    const rawTokens = [];
    function addToken(line, startChar, length, typeStr, modifiers = 0) {
        const typeIdx = exports.SEMANTIC_TOKEN_TYPES.indexOf(typeStr);
        if (typeIdx === -1 || length <= 0 || line < 0 || startChar < 0)
            return;
        rawTokens.push({
            line,
            startChar,
            length,
            tokenType: typeIdx,
            tokenModifiers: modifiers,
        });
    }
    function visitNode(node) {
        if (!node || typeof node !== "object")
            return;
        if (node.kind === "FunctionDeclStmt") {
            const stmt = node;
            // Function name token
            const line = stmt.span.start.line - 1;
            const fnIdx = doc.lines[line]?.indexOf(`fn ${stmt.name}`);
            if (fnIdx !== -1 && fnIdx !== undefined) {
                addToken(line, fnIdx + 3, stmt.name.length, "function", 1); // 1 = declaration
            }
            // Parameter tokens
            for (const p of stmt.params) {
                const pLine = p.span ? p.span.start.line - 1 : line;
                const pCol = p.span ? p.span.start.column - 1 : 0;
                addToken(pLine, pCol, p.name.length, "parameter", 1);
            }
        }
        else if (node.kind === "VarDeclStmt") {
            const stmt = node;
            const line = stmt.span.start.line - 1;
            const kwIdx = doc.lines[line]?.indexOf(`let ${stmt.name}`);
            if (kwIdx !== -1 && kwIdx !== undefined) {
                addToken(line, kwIdx + 4, stmt.name.length, "variable", 1);
            }
        }
        else if (node.kind === "ConstDeclStmt") {
            const stmt = node;
            const line = stmt.span.start.line - 1;
            const kwIdx = doc.lines[line]?.indexOf(`const ${stmt.name}`);
            if (kwIdx !== -1 && kwIdx !== undefined) {
                addToken(line, kwIdx + 6, stmt.name.length, "variable", 3); // 1 = decl + 2 = readonly
            }
        }
        else if (node.kind === "StructDeclStmt") {
            const stmt = node;
            const line = stmt.span.start.line - 1;
            const sIdx = doc.lines[line]?.indexOf(`struct ${stmt.name}`);
            if (sIdx !== -1 && sIdx !== undefined) {
                addToken(line, sIdx + 7, stmt.name.length, "struct", 1);
            }
        }
        // Recursively visit children
        for (const key of Object.keys(node)) {
            if (key === "span")
                continue;
            const child = node[key];
            if (Array.isArray(child)) {
                for (const item of child)
                    visitNode(item);
            }
            else if (child && typeof child === "object") {
                visitNode(child);
            }
        }
    }
    visitNode(doc.ast);
    // Sort tokens by line ascending, then startChar ascending
    rawTokens.sort((a, b) => {
        if (a.line !== b.line)
            return a.line - b.line;
        return a.startChar - b.startChar;
    });
    // Delta encoding for LSP
    const data = [];
    let prevLine = 0;
    let prevChar = 0;
    for (const tok of rawTokens) {
        const deltaLine = tok.line - prevLine;
        const deltaStartChar = deltaLine === 0 ? tok.startChar - prevChar : tok.startChar;
        data.push(deltaLine, deltaStartChar, tok.length, tok.tokenType, tok.tokenModifiers);
        prevLine = tok.line;
        prevChar = tok.startChar;
    }
    return { data };
}
//# sourceMappingURL=semantic-tokens.js.map