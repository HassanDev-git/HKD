/**
 * HKD Language Server Protocol 2.0 Server
 *
 * Implements full LSP 3.17 server capabilities with incremental document sync,
 * debounced compiler diagnostics, real semantic IntelliSense, and workspace intelligence.
 */

import { Readable, Writable } from "stream";
import {
  JsonRpcTransport,
  JsonRpcRequest,
  JsonRpcNotification,
  JsonRpcMessage,
} from "./protocol.js";
import { DocumentManager } from "./documents.js";
import { WorkspaceGraph } from "./workspace-graph.js";
import { HKD_SEMANTIC_LEGEND, computeSemanticTokens } from "./semantic-tokens.js";
import {
  getCompletionItems,
  getSignatureHelp,
  getHover,
  getDefinition,
  getReferences,
  renameSymbol,
  getDocumentSymbols,
  getDocumentHighlights,
  getCodeActions,
  getCodeLenses,
} from "./features.js";
import { format } from "../formatter/index.js";

export class HkdLanguageServer {
  public transport: JsonRpcTransport;
  public documents: DocumentManager;
  public workspace: WorkspaceGraph;
  private isShutdown = false;

  constructor(
    reader: Readable = process.stdin,
    writer: Writable = process.stdout
  ) {
    this.documents = new DocumentManager();
    this.workspace = new WorkspaceGraph();
    this.transport = new JsonRpcTransport(reader, writer);
    this.transport.onMessage((msg) => this.handleMessage(msg));
  }

  public handleMessage(msg: JsonRpcMessage): void {
    if ("method" in msg && typeof msg.method === "string") {
      if ("id" in msg && msg.id !== undefined && msg.id !== null) {
        this.handleRequest(msg as JsonRpcRequest);
      } else {
        this.handleNotification(msg as JsonRpcNotification);
      }
    }
  }

  private handleRequest(req: JsonRpcRequest): void {
    if (this.isShutdown && req.method !== "exit") {
      this.transport.sendError(req.id, -32600, "Server is shutting down");
      return;
    }

    try {
      switch (req.method) {
        case "initialize": {
          const rootUri = req.params?.rootUri;
          const workspaceFolders = req.params?.workspaceFolders;
          const roots: string[] = [];

          if (Array.isArray(workspaceFolders)) {
            for (const f of workspaceFolders) {
              roots.push(f.uri.replace(/^file:\/\/\/?/i, ""));
            }
          } else if (rootUri) {
            roots.push(rootUri.replace(/^file:\/\/\/?/i, ""));
          }
          this.workspace.setRoots(roots);

          this.transport.sendResponse(req.id, {
            capabilities: {
              textDocumentSync: 2, // Incremental sync
              hoverProvider: true,
              definitionProvider: true,
              referencesProvider: true,
              documentSymbolProvider: true,
              workspaceSymbolProvider: true,
              documentHighlightProvider: true,
              renameProvider: true,
              signatureHelpProvider: {
                triggerCharacters: ["(", ","],
              },
              completionProvider: {
                resolveProvider: false,
                triggerCharacters: [".", ":", '"', "'", "/"],
              },
              semanticTokensProvider: {
                legend: HKD_SEMANTIC_LEGEND,
                full: true,
              },
              codeActionProvider: true,
              codeLensProvider: {
                resolveProvider: false,
              },
              documentFormattingProvider: true,
              documentRangeFormattingProvider: true,
            },
            serverInfo: {
              name: "HKD Language Server",
              version: "2.0.0",
            },
          });
          break;
        }

        case "shutdown": {
          this.isShutdown = true;
          this.transport.sendResponse(req.id, null);
          break;
        }

        case "textDocument/completion": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const items = getCompletionItems(doc, req.params.position, this.workspace);
          this.transport.sendResponse(req.id, items);
          break;
        }

        case "textDocument/signatureHelp": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, null);
            return;
          }
          const sig = getSignatureHelp(doc, req.params.position);
          this.transport.sendResponse(req.id, sig);
          break;
        }

        case "textDocument/hover": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, null);
            return;
          }
          const hover = getHover(doc, req.params.position, this.workspace);
          this.transport.sendResponse(req.id, hover);
          break;
        }

        case "textDocument/definition": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, null);
            return;
          }
          const def = getDefinition(doc, req.params.position, this.workspace);
          this.transport.sendResponse(req.id, def);
          break;
        }

        case "textDocument/references": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const refs = getReferences(doc, req.params.position, this.workspace);
          this.transport.sendResponse(req.id, refs);
          break;
        }

        case "textDocument/rename": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, null);
            return;
          }
          const edit = renameSymbol(doc, req.params.position, req.params.newName, this.workspace);
          this.transport.sendResponse(req.id, edit);
          break;
        }

        case "textDocument/documentSymbol": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const symbols = getDocumentSymbols(doc);
          this.transport.sendResponse(req.id, symbols);
          break;
        }

        case "workspace/symbol": {
          const allSymbols: any[] = [];
          for (const doc of this.documents.getAll()) {
            const syms = getDocumentSymbols(doc);
            for (const s of syms) {
              allSymbols.push({
                name: s.name,
                kind: s.kind,
                location: { uri: doc.uri, range: s.range },
              });
            }
          }
          this.transport.sendResponse(req.id, allSymbols);
          break;
        }

        case "textDocument/documentHighlight": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const highlights = getDocumentHighlights(doc, req.params.position);
          this.transport.sendResponse(req.id, highlights);
          break;
        }

        case "textDocument/semanticTokens/full": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, { data: [] });
            return;
          }
          const tokens = computeSemanticTokens(doc);
          this.transport.sendResponse(req.id, tokens);
          break;
        }

        case "textDocument/codeAction": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const actions = getCodeActions(doc, req.params.range);
          this.transport.sendResponse(req.id, actions);
          break;
        }

        case "textDocument/codeLens": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const lenses = getCodeLenses(doc);
          this.transport.sendResponse(req.id, lenses);
          break;
        }

        case "textDocument/formatting": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const formatted = format(doc.text);
          this.transport.sendResponse(req.id, [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: doc.lines.length, character: 0 },
              },
              newText: formatted,
            },
          ]);
          break;
        }

        case "textDocument/rangeFormatting": {
          const doc = this.documents.get(req.params.textDocument.uri);
          if (!doc) {
            this.transport.sendResponse(req.id, []);
            return;
          }
          const formatted = format(doc.text);
          this.transport.sendResponse(req.id, [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: doc.lines.length, character: 0 },
              },
              newText: formatted,
            },
          ]);
          break;
        }

        default:
          this.transport.sendError(req.id, -32601, `Method '${req.method}' not found`);
          break;
      }
    } catch (err: any) {
      this.transport.sendError(req.id, -32603, `Internal error: ${err.message}`);
    }
  }

  private handleNotification(notif: JsonRpcNotification): void {
    switch (notif.method) {
      case "initialized":
        break;

      case "exit":
        process.exit(this.isShutdown ? 0 : 1);
        break;

      case "textDocument/didOpen": {
        const item = notif.params.textDocument;
        const doc = this.documents.open(item.uri, item.version, item.text);
        this.publishDiagnostics(doc);
        break;
      }

      case "textDocument/didChange": {
        const item = notif.params.textDocument;
        this.documents.update(
          item.uri,
          item.version,
          notif.params.contentChanges,
          (doc) => this.publishDiagnostics(doc)
        );
        break;
      }

      case "textDocument/didClose": {
        const uri = notif.params.textDocument.uri;
        this.documents.close(uri);
        // Clear diagnostics on close
        this.transport.sendNotification("textDocument/publishDiagnostics", {
          uri,
          diagnostics: [],
        });
        break;
      }

      case "workspace/didChangeConfiguration":
      case "workspace/didChangeWatchedFiles":
        break;
    }
  }

  public publishDiagnostics(doc: { uri: string; diagnostics: any[] }): void {
    this.transport.sendNotification("textDocument/publishDiagnostics", {
      uri: doc.uri,
      diagnostics: doc.diagnostics,
    });
  }
}

// Start standalone server when executed directly
if (process.env.NODE_ENV !== "test" && require.main === module) {
  new HkdLanguageServer();
}
