/**
 * HKD Incremental Document Engine
 *
 * Manages open editor documents, character offset conversions, incremental delta edits,
 * and compiler AST & semantic model caching with debounced analysis.
 */
import { Position, Range, Diagnostic } from "./protocol.js";
import { SemanticAnalyser } from "../semantic/analyser.js";
import * as N from "../ast/nodes.js";
export interface TextDocumentContentChangeEvent {
    range?: Range;
    rangeLength?: number;
    text: string;
}
export declare class TrackedDocument {
    uri: string;
    version: number;
    text: string;
    lines: string[];
    lineOffsets: number[];
    ast: N.Program | null;
    semanticModel: SemanticAnalyser | null;
    diagnostics: Diagnostic[];
    lastAnalyzedVersion: number;
    constructor(uri: string, version: number, text: string);
    recomputeLines(): void;
    positionToOffset(pos: Position): number;
    offsetToPosition(offset: number): Position;
    applyChanges(changes: TextDocumentContentChangeEvent[]): void;
    getFilePath(): string;
}
export declare class DocumentManager {
    private documents;
    private debounceTimers;
    open(uri: string, version: number, text: string): TrackedDocument;
    update(uri: string, version: number, changes: TextDocumentContentChangeEvent[], onAnalyzed?: (doc: TrackedDocument) => void): TrackedDocument;
    close(uri: string): void;
    get(uri: string): TrackedDocument | null;
    getAll(): TrackedDocument[];
    /**
     * Runs the real HKD Lexer, Parser, and Semantic Analyzer on the document.
     */
    analyze(doc: TrackedDocument): void;
}
//# sourceMappingURL=documents.d.ts.map