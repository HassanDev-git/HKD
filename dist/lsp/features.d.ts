/**
 * HKD Language Server Protocol Features Engine
 *
 * Real compiler-backed implementations for Completion, Hover, Signature Help,
 * Definition, References, Rename, Symbols, Highlights, Code Actions, and CodeLens.
 */
import { Position, Range, Location, CompletionItem, Hover, SignatureHelp, DocumentSymbol, DocumentHighlight, CodeAction, CodeLens, WorkspaceEdit } from "./protocol.js";
import { TrackedDocument } from "./documents.js";
import { WorkspaceGraph } from "./workspace-graph.js";
export declare function getWordAtPosition(doc: TrackedDocument, pos: Position): string;
export declare function getCompletionItems(doc: TrackedDocument, pos: Position, ws: WorkspaceGraph): CompletionItem[];
export declare function getSignatureHelp(doc: TrackedDocument, pos: Position): SignatureHelp | null;
export declare function getHover(doc: TrackedDocument, pos: Position, ws: WorkspaceGraph): Hover | null;
export declare function getDefinition(doc: TrackedDocument, pos: Position, ws: WorkspaceGraph): Location | Location[] | null;
export declare function getReferences(doc: TrackedDocument, pos: Position, _ws: WorkspaceGraph): Location[];
export declare function renameSymbol(doc: TrackedDocument, pos: Position, newName: string, ws: WorkspaceGraph): WorkspaceEdit | null;
export declare function getDocumentSymbols(doc: TrackedDocument): DocumentSymbol[];
export declare function getDocumentHighlights(doc: TrackedDocument, pos: Position): DocumentHighlight[];
export declare function getCodeActions(doc: TrackedDocument, range: Range): CodeAction[];
export declare function getCodeLenses(doc: TrackedDocument): CodeLens[];
//# sourceMappingURL=features.d.ts.map