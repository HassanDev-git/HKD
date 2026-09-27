/**
 * HKD LSP Semantic Tokens Provider
 *
 * Implements LSP 3.17 textDocument/semanticTokens/full by walking the compiler AST
 * and encoding semantic token deltas.
 */
import { SemanticTokens, SemanticTokensLegend } from "./protocol.js";
import { TrackedDocument } from "./documents.js";
export declare const SEMANTIC_TOKEN_TYPES: string[];
export declare const SEMANTIC_TOKEN_MODIFIERS: string[];
export declare const HKD_SEMANTIC_LEGEND: SemanticTokensLegend;
export declare function computeSemanticTokens(doc: TrackedDocument): SemanticTokens;
//# sourceMappingURL=semantic-tokens.d.ts.map