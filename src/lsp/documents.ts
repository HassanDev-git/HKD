/**
 * HKD Incremental Document Engine
 *
 * Manages open editor documents, character offset conversions, incremental delta edits,
 * and compiler AST & semantic model caching with debounced analysis.
 */

import { Position, Range, Diagnostic, DiagnosticSeverity, DocumentSymbol } from "./protocol.js";
import { Lexer } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { SemanticAnalyser } from "../semantic/analyser.js";
import { ErrorReporter } from "../errors/index.js";
import * as N from "../ast/nodes.js";

export interface TextDocumentContentChangeEvent {
  range?: Range;
  rangeLength?: number;
  text: string;
}

export class TrackedDocument {
  public uri: string;
  public version: number;
  public text: string;
  public lines: string[] = [];
  public lineOffsets: number[] = [];

  // Cached compiler models
  public ast: N.Program | null = null;
  public semanticModel: SemanticAnalyser | null = null;
  public diagnostics: Diagnostic[] = [];
  public lastAnalyzedVersion = -1;

  constructor(uri: string, version: number, text: string) {
    this.uri = uri;
    this.version = version;
    this.text = text;
    this.recomputeLines();
  }

  public recomputeLines(): void {
    this.lines = this.text.split("\n");
    this.lineOffsets = [0];
    let curr = 0;
    for (let i = 0; i < this.lines.length; i++) {
      curr += this.lines[i].length + 1; // +1 for '\n'
      this.lineOffsets.push(curr);
    }
  }

  public positionToOffset(pos: Position): number {
    if (pos.line < 0) return 0;
    if (pos.line >= this.lines.length) return this.text.length;
    const lineStart = this.lineOffsets[pos.line];
    return Math.min(lineStart + Math.max(0, pos.character), this.text.length);
  }

  public offsetToPosition(offset: number): Position {
    if (offset <= 0) return { line: 0, character: 0 };
    if (offset >= this.text.length) {
      const lastLine = Math.max(0, this.lines.length - 1);
      return { line: lastLine, character: this.lines[lastLine]?.length || 0 };
    }

    let low = 0;
    let high = this.lines.length - 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const start = this.lineOffsets[mid];
      const next = this.lineOffsets[mid + 1] ?? this.text.length + 1;

      if (offset >= start && offset < next) {
        return { line: mid, character: offset - start };
      }

      if (offset < start) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return { line: 0, character: 0 };
  }

  public applyChanges(changes: TextDocumentContentChangeEvent[]): void {
    for (const change of changes) {
      if (change.range) {
        const startOffset = this.positionToOffset(change.range.start);
        const endOffset = this.positionToOffset(change.range.end);
        this.text =
          this.text.slice(0, startOffset) +
          change.text +
          this.text.slice(endOffset);
      } else {
        this.text = change.text;
      }
    }
    this.recomputeLines();
  }

  public getFilePath(): string {
    return this.uri.replace(/^file:\/\/\/?/i, "").replace(/%20/g, " ");
  }
}

export class DocumentManager {
  private documents: Map<string, TrackedDocument> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  public open(uri: string, version: number, text: string): TrackedDocument {
    const doc = new TrackedDocument(uri, version, text);
    this.documents.set(uri, doc);
    this.analyze(doc);
    return doc;
  }

  public update(
    uri: string,
    version: number,
    changes: TextDocumentContentChangeEvent[],
    onAnalyzed?: (doc: TrackedDocument) => void
  ): TrackedDocument {
    let doc = this.documents.get(uri);
    if (!doc) {
      doc = new TrackedDocument(uri, version, "");
      this.documents.set(uri, doc);
    }

    doc.version = version;
    doc.applyChanges(changes);

    // Debounce re-analysis by 150ms for responsive typing
    const existing = this.debounceTimers.get(uri);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.analyze(doc!);
      if (onAnalyzed) onAnalyzed(doc!);
      this.debounceTimers.delete(uri);
    }, 150);

    this.debounceTimers.set(uri, timer);
    return doc;
  }

  public close(uri: string): void {
    const timer = this.debounceTimers.get(uri);
    if (timer) clearTimeout(timer);
    this.debounceTimers.delete(uri);
    this.documents.delete(uri);
  }

  public get(uri: string): TrackedDocument | null {
    return this.documents.get(uri) ?? null;
  }

  public getAll(): TrackedDocument[] {
    return Array.from(this.documents.values());
  }

  /**
   * Runs the real HKD Lexer, Parser, and Semantic Analyzer on the document.
   */
  public analyze(doc: TrackedDocument): void {
    const filePath = doc.getFilePath();
    const reporter = new ErrorReporter(doc.text, filePath);

    const diagnostics: Diagnostic[] = [];

    try {
      const lexer = new Lexer(doc.text, filePath, reporter);
      const tokens = lexer.tokenize();

      const edition = /edition\s*=\s*"2027"/.test(doc.text) || /#feature\(traits\)/.test(doc.text) || /#feature\(async\)/.test(doc.text) || /\btrait\b/.test(doc.text) || /\basync\b/.test(doc.text) ? "2027" : undefined;
      const parser = new Parser(tokens, doc.text, filePath, reporter, edition);
      doc.ast = parser.parse();

      const analyzer = new SemanticAnalyser(reporter, doc.text);
      analyzer.analyse(doc.ast);
      doc.semanticModel = analyzer;
    } catch {
      // Lexing or parsing exceptions are recorded in reporter
    }

    // Convert errors & warnings to LSP Diagnostics
    for (const err of reporter.getErrors()) {
      const startLine = err.span ? Math.max(0, err.span.start.line - 1) : 0;
      const startChar = err.span ? Math.max(0, err.span.start.column - 1) : 0;
      const endLine = err.span ? Math.max(0, err.span.end.line - 1) : startLine;
      const endChar = err.span ? Math.max(0, err.span.end.column - 1) : startChar + 1;

      diagnostics.push({
        range: {
          start: { line: startLine, character: startChar },
          end: { line: endLine, character: endChar },
        },
        severity: DiagnosticSeverity.Error,
        code: err.code || "SYN001",
        source: "hkd",
        message: err.message,
      });
    }

    for (const warn of reporter.getWarnings()) {
      const startLine = warn.span ? Math.max(0, warn.span.start.line - 1) : 0;
      const startChar = warn.span ? Math.max(0, warn.span.start.column - 1) : 0;
      const endLine = warn.span ? Math.max(0, warn.span.end.line - 1) : startLine;
      const endChar = warn.span ? Math.max(0, warn.span.end.column - 1) : startChar + 1;

      diagnostics.push({
        range: {
          start: { line: startLine, character: startChar },
          end: { line: endLine, character: endChar },
        },
        severity: DiagnosticSeverity.Warning,
        code: warn.code || "LINT001",
        source: "hkd",
        message: warn.message,
      });
    }

    doc.diagnostics = diagnostics;
    doc.lastAnalyzedVersion = doc.version;
  }
}
