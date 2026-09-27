/**
 * HKD Language Server Protocol 2.0 Server
 *
 * Implements full LSP 3.17 server capabilities with incremental document sync,
 * debounced compiler diagnostics, real semantic IntelliSense, and workspace intelligence.
 */
import { Readable, Writable } from "stream";
import { JsonRpcTransport, JsonRpcMessage } from "./protocol.js";
import { DocumentManager } from "./documents.js";
import { WorkspaceGraph } from "./workspace-graph.js";
export declare class HkdLanguageServer {
    transport: JsonRpcTransport;
    documents: DocumentManager;
    workspace: WorkspaceGraph;
    private isShutdown;
    constructor(reader?: Readable, writer?: Writable);
    handleMessage(msg: JsonRpcMessage): void;
    private handleRequest;
    private handleNotification;
    publishDiagnostics(doc: {
        uri: string;
        diagnostics: any[];
    }): void;
}
//# sourceMappingURL=server.d.ts.map