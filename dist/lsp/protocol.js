"use strict";
/**
 * HKD Language Server Protocol Types & JSON-RPC Transport Layer
 *
 * Implements strict LSP 3.17 wire framing, message serialization, and type definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonRpcTransport = exports.DocumentHighlightKind = exports.SymbolKind = exports.CompletionItemKind = exports.DiagnosticSeverity = void 0;
var DiagnosticSeverity;
(function (DiagnosticSeverity) {
    DiagnosticSeverity[DiagnosticSeverity["Error"] = 1] = "Error";
    DiagnosticSeverity[DiagnosticSeverity["Warning"] = 2] = "Warning";
    DiagnosticSeverity[DiagnosticSeverity["Information"] = 3] = "Information";
    DiagnosticSeverity[DiagnosticSeverity["Hint"] = 4] = "Hint";
})(DiagnosticSeverity || (exports.DiagnosticSeverity = DiagnosticSeverity = {}));
// ─── Capabilities & Enums ─────────────────────────────────────────────────────
var CompletionItemKind;
(function (CompletionItemKind) {
    CompletionItemKind[CompletionItemKind["Text"] = 1] = "Text";
    CompletionItemKind[CompletionItemKind["Method"] = 2] = "Method";
    CompletionItemKind[CompletionItemKind["Function"] = 3] = "Function";
    CompletionItemKind[CompletionItemKind["Constructor"] = 4] = "Constructor";
    CompletionItemKind[CompletionItemKind["Field"] = 5] = "Field";
    CompletionItemKind[CompletionItemKind["Variable"] = 6] = "Variable";
    CompletionItemKind[CompletionItemKind["Class"] = 7] = "Class";
    CompletionItemKind[CompletionItemKind["Interface"] = 8] = "Interface";
    CompletionItemKind[CompletionItemKind["Module"] = 9] = "Module";
    CompletionItemKind[CompletionItemKind["Property"] = 10] = "Property";
    CompletionItemKind[CompletionItemKind["Unit"] = 11] = "Unit";
    CompletionItemKind[CompletionItemKind["Value"] = 12] = "Value";
    CompletionItemKind[CompletionItemKind["Enum"] = 13] = "Enum";
    CompletionItemKind[CompletionItemKind["Keyword"] = 14] = "Keyword";
    CompletionItemKind[CompletionItemKind["Snippet"] = 15] = "Snippet";
    CompletionItemKind[CompletionItemKind["Color"] = 16] = "Color";
    CompletionItemKind[CompletionItemKind["File"] = 17] = "File";
    CompletionItemKind[CompletionItemKind["Reference"] = 18] = "Reference";
    CompletionItemKind[CompletionItemKind["Folder"] = 19] = "Folder";
    CompletionItemKind[CompletionItemKind["EnumMember"] = 20] = "EnumMember";
    CompletionItemKind[CompletionItemKind["Constant"] = 21] = "Constant";
    CompletionItemKind[CompletionItemKind["Struct"] = 22] = "Struct";
    CompletionItemKind[CompletionItemKind["Event"] = 23] = "Event";
    CompletionItemKind[CompletionItemKind["Operator"] = 24] = "Operator";
    CompletionItemKind[CompletionItemKind["TypeParameter"] = 25] = "TypeParameter";
})(CompletionItemKind || (exports.CompletionItemKind = CompletionItemKind = {}));
var SymbolKind;
(function (SymbolKind) {
    SymbolKind[SymbolKind["File"] = 1] = "File";
    SymbolKind[SymbolKind["Module"] = 2] = "Module";
    SymbolKind[SymbolKind["Namespace"] = 3] = "Namespace";
    SymbolKind[SymbolKind["Package"] = 4] = "Package";
    SymbolKind[SymbolKind["Class"] = 5] = "Class";
    SymbolKind[SymbolKind["Method"] = 6] = "Method";
    SymbolKind[SymbolKind["Property"] = 7] = "Property";
    SymbolKind[SymbolKind["Field"] = 8] = "Field";
    SymbolKind[SymbolKind["Constructor"] = 9] = "Constructor";
    SymbolKind[SymbolKind["Enum"] = 10] = "Enum";
    SymbolKind[SymbolKind["Interface"] = 11] = "Interface";
    SymbolKind[SymbolKind["Function"] = 12] = "Function";
    SymbolKind[SymbolKind["Variable"] = 13] = "Variable";
    SymbolKind[SymbolKind["Constant"] = 14] = "Constant";
    SymbolKind[SymbolKind["String"] = 15] = "String";
    SymbolKind[SymbolKind["Number"] = 16] = "Number";
    SymbolKind[SymbolKind["Boolean"] = 17] = "Boolean";
    SymbolKind[SymbolKind["Array"] = 18] = "Array";
    SymbolKind[SymbolKind["Object"] = 19] = "Object";
    SymbolKind[SymbolKind["Key"] = 20] = "Key";
    SymbolKind[SymbolKind["Null"] = 21] = "Null";
    SymbolKind[SymbolKind["EnumMember"] = 22] = "EnumMember";
    SymbolKind[SymbolKind["Struct"] = 23] = "Struct";
    SymbolKind[SymbolKind["Event"] = 24] = "Event";
    SymbolKind[SymbolKind["Operator"] = 25] = "Operator";
    SymbolKind[SymbolKind["TypeParameter"] = 26] = "TypeParameter";
})(SymbolKind || (exports.SymbolKind = SymbolKind = {}));
var DocumentHighlightKind;
(function (DocumentHighlightKind) {
    DocumentHighlightKind[DocumentHighlightKind["Text"] = 1] = "Text";
    DocumentHighlightKind[DocumentHighlightKind["Read"] = 2] = "Read";
    DocumentHighlightKind[DocumentHighlightKind["Write"] = 3] = "Write";
})(DocumentHighlightKind || (exports.DocumentHighlightKind = DocumentHighlightKind = {}));
// ─── Streaming JSON-RPC Transport ─────────────────────────────────────────────
class JsonRpcTransport {
    reader;
    writer;
    buffer = "";
    onMessageCallback = () => { };
    constructor(reader, writer) {
        this.reader = reader;
        this.writer = writer;
        this.reader.on("data", (chunk) => {
            this.buffer += chunk.toString("utf-8");
            this.processBuffer();
        });
    }
    onMessage(callback) {
        this.onMessageCallback = callback;
    }
    send(msg) {
        const json = JSON.stringify(msg);
        const byteLen = Buffer.byteLength(json, "utf-8");
        const payload = `Content-Length: ${byteLen}\r\n\r\n${json}`;
        this.writer.write(payload, "utf-8");
    }
    sendResponse(id, result) {
        this.send({ jsonrpc: "2.0", id, result });
    }
    sendError(id, code, message, data) {
        this.send({ jsonrpc: "2.0", id, error: { code, message, data } });
    }
    sendNotification(method, params) {
        this.send({ jsonrpc: "2.0", method, params });
    }
    processBuffer() {
        while (true) {
            const headerMatch = this.buffer.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
            if (!headerMatch)
                break;
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
            }
            catch (err) {
                // Send parse error if it was a request with id
                this.sendError(null, -32700, "Parse error: " + err.message);
            }
        }
    }
}
exports.JsonRpcTransport = JsonRpcTransport;
//# sourceMappingURL=protocol.js.map