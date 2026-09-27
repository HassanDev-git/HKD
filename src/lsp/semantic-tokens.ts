/**
 * HKD LSP Semantic Tokens Provider
 *
 * Implements LSP 3.17 textDocument/semanticTokens/full by walking the compiler AST
 * and encoding semantic token deltas.
 */

import { SemanticTokens, SemanticTokensLegend } from "./protocol.js";
import { TrackedDocument } from "./documents.js";
import * as N from "../ast/nodes.js";

export const SEMANTIC_TOKEN_TYPES = [
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

export const SEMANTIC_TOKEN_MODIFIERS = [
  "declaration",
  "readonly",
  "defaultLibrary",
];

export const HKD_SEMANTIC_LEGEND: SemanticTokensLegend = {
  tokenTypes: SEMANTIC_TOKEN_TYPES,
  tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
};

interface RawToken {
  line: number;      // 0-indexed
  startChar: number; // 0-indexed
  length: number;
  tokenType: number;
  tokenModifiers: number;
}

export function computeSemanticTokens(doc: TrackedDocument): SemanticTokens {
  if (!doc.ast) {
    return { data: [] };
  }

  const rawTokens: RawToken[] = [];

  function addToken(line: number, startChar: number, length: number, typeStr: string, modifiers = 0) {
    const typeIdx = SEMANTIC_TOKEN_TYPES.indexOf(typeStr);
    if (typeIdx === -1 || length <= 0 || line < 0 || startChar < 0) return;
    rawTokens.push({
      line,
      startChar,
      length,
      tokenType: typeIdx,
      tokenModifiers: modifiers,
    });
  }

  function visitNode(node: any) {
    if (!node || typeof node !== "object") return;

    if (node.kind === "FunctionDeclStmt") {
      const stmt = node as N.FunctionDeclStmt;
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
    } else if (node.kind === "VarDeclStmt") {
      const stmt = node as N.VarDeclStmt;
      const line = stmt.span.start.line - 1;
      const kwIdx = doc.lines[line]?.indexOf(`let ${stmt.name}`);
      if (kwIdx !== -1 && kwIdx !== undefined) {
        addToken(line, kwIdx + 4, stmt.name.length, "variable", 1);
      }
    } else if (node.kind === "ConstDeclStmt") {
      const stmt = node as N.ConstDeclStmt;
      const line = stmt.span.start.line - 1;
      const kwIdx = doc.lines[line]?.indexOf(`const ${stmt.name}`);
      if (kwIdx !== -1 && kwIdx !== undefined) {
        addToken(line, kwIdx + 6, stmt.name.length, "variable", 3); // 1 = decl + 2 = readonly
      }
    } else if (node.kind === "StructDeclStmt") {
      const stmt = node as N.StructDeclStmt;
      const line = stmt.span.start.line - 1;
      const sIdx = doc.lines[line]?.indexOf(`struct ${stmt.name}`);
      if (sIdx !== -1 && sIdx !== undefined) {
        addToken(line, sIdx + 7, stmt.name.length, "struct", 1);
      }
    }

    // Recursively visit children
    for (const key of Object.keys(node)) {
      if (key === "span") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const item of child) visitNode(item);
      } else if (child && typeof child === "object") {
        visitNode(child);
      }
    }
  }

  visitNode(doc.ast);

  // Sort tokens by line ascending, then startChar ascending
  rawTokens.sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    return a.startChar - b.startChar;
  });

  // Delta encoding for LSP
  const data: number[] = [];
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
