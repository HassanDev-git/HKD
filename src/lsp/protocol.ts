/**
 * HKD Language Server Protocol Types & JSON-RPC Transport Layer
 *
 * Implements strict LSP 3.17 wire framing, message serialization, and type definitions.
 */

import { Readable, Writable } from "stream";

// ─── LSP 3.17 Basic Types ─────────────────────────────────────────────────────

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface TextEdit {
  range: Range;
  newText: string;
}

export interface WorkspaceEdit {
  changes?: Record<string, TextEdit[]>;
}

export enum DiagnosticSeverity {
  Error = 1,
  Warning = 2,
  Information = 3,
  Hint = 4,
}

export interface DiagnosticRelatedInformation {
  location: Location;
  message: string;
}

export interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;
  code?: number | string;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}

export interface Command {
  title: string;
  command: string;
  arguments?: any[];
}

// ─── Capabilities & Enums ─────────────────────────────────────────────────────

export enum CompletionItemKind {
  Text = 1,
  Method = 2,
  Function = 3,
  Constructor = 4,
  Field = 5,
  Variable = 6,
  Class = 7,
  Interface = 8,
  Module = 9,
  Property = 10,
  Unit = 11,
  Value = 12,
  Enum = 13,
  Keyword = 14,
  Snippet = 15,
  Color = 16,
  File = 17,
  Reference = 18,
  Folder = 19,
  EnumMember = 20,
  Constant = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export interface CompletionItem {
  label: string;
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: string | { kind: "markdown" | "plaintext"; value: string };
  insertText?: string;
  sortText?: string;
}

export interface MarkupContent {
  kind: "plaintext" | "markdown";
  value: string;
}

export interface Hover {
  contents: MarkupContent | string;
  range?: Range;
}

export interface ParameterInformation {
  label: string | [number, number];
  documentation?: string | MarkupContent;
}

export interface SignatureInformation {
  label: string;
  documentation?: string | MarkupContent;
  parameters?: ParameterInformation[];
  activeParameter?: number;
}

export interface SignatureHelp {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
}

export enum SymbolKind {
  File = 1,
  Module = 2,
  Namespace = 3,
  Package = 4,
  Class = 5,
  Method = 6,
  Property = 7,
  Field = 8,
  Constructor = 9,
  Enum = 10,
  Interface = 11,
  Function = 12,
  Variable = 13,
  Constant = 14,
  String = 15,
  Number = 16,
  Boolean = 17,
  Array = 18,
  Object = 19,
  Key = 20,
  Null = 21,
  EnumMember = 22,
  Struct = 23,
  Event = 24,
  Operator = 25,
  TypeParameter = 26,
}

export interface DocumentSymbol {
  name: string;
  detail?: string;
  kind: SymbolKind;
  range: Range;
  selectionRange: Range;
  children?: DocumentSymbol[];
}

export enum DocumentHighlightKind {
  Text = 1,
  Read = 2,
  Write = 3,
}

export interface DocumentHighlight {
  range: Range;
  kind?: DocumentHighlightKind;
}

export interface CodeAction {
  title: string;
  kind?: string;
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  command?: Command;
}

export interface CodeLens {
  range: Range;
  command?: Command;
  data?: any;
}

export interface FormattingOptions {
  tabSize: number;
  insertSpaces: boolean;
}

export interface SemanticTokensLegend {
  tokenTypes: string[];
  tokenModifiers: string[];
}

export interface SemanticTokens {
  resultId?: string;
  data: number[];
}

// ─── JSON-RPC Messages ────────────────────────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: any;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

// ─── Streaming JSON-RPC Transport ─────────────────────────────────────────────

export class JsonRpcTransport {
  private buffer = "";
  private onMessageCallback: (msg: JsonRpcMessage) => void = () => {};

  constructor(
    private reader: Readable,
    private writer: Writable
  ) {
    this.reader.on("data", (chunk: Buffer | string) => {
      this.buffer += chunk.toString("utf-8");
      this.processBuffer();
    });
  }

  onMessage(callback: (msg: JsonRpcMessage) => void): void {
    this.onMessageCallback = callback;
  }

  send(msg: JsonRpcMessage): void {
    const json = JSON.stringify(msg);
    const byteLen = Buffer.byteLength(json, "utf-8");
    const payload = `Content-Length: ${byteLen}\r\n\r\n${json}`;
    this.writer.write(payload, "utf-8");
  }

  sendResponse(id: number | string | null, result: any): void {
    this.send({ jsonrpc: "2.0", id, result });
  }

  sendError(id: number | string | null, code: number, message: string, data?: any): void {
    this.send({ jsonrpc: "2.0", id, error: { code, message, data } });
  }

  sendNotification(method: string, params?: any): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private processBuffer(): void {
    while (true) {
      const headerMatch = this.buffer.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
      if (!headerMatch) break;

      const headerLen = headerMatch[0].length;
      const contentLength = parseInt(headerMatch[1], 10);

      if (this.buffer.length < headerLen + contentLength) {
        break; // Wait for more data
      }

      const bodyStr = this.buffer.slice(headerLen, headerLen + contentLength);
      this.buffer = this.buffer.slice(headerLen + contentLength);

      try {
        const parsed = JSON.parse(bodyStr);
        this.onMessageCallback(parsed);
      } catch (err: any) {
        // Send parse error if it was a request with id
        this.sendError(null, -32700, "Parse error: " + err.message);
      }
    }
  }
}
