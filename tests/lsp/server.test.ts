import { PassThrough } from "stream";
import { HkdLanguageServer } from "../../src/lsp/server.js";

describe("HKD LSP 2.0 — JSON-RPC Protocol & Server Integration", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let server: HkdLanguageServer;
  let receivedMessages: any[] = [];

  function sendClientMessage(msg: any) {
    const json = JSON.stringify(msg);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n${json}`;
    inStream.write(payload);
  }

  beforeEach(() => {
    inStream = new PassThrough();
    outStream = new PassThrough();
    receivedMessages = [];

    let buffer = "";
    outStream.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");
      while (true) {
        const match = buffer.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
        if (!match) break;
        const headerLen = match[0].length;
        const len = parseInt(match[1], 10);
        if (buffer.length < headerLen + len) break;
        const body = buffer.slice(headerLen, headerLen + len);
        buffer = buffer.slice(headerLen + len);
        receivedMessages.push(JSON.parse(body));
      }
    });

    server = new HkdLanguageServer(inStream, outStream);
  });

  test("initialize handshake advertises LSP 2.0 capabilities", async () => {
    sendClientMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { rootUri: "file:///workspace" },
    });

    await new Promise((r) => setTimeout(r, 50));

    expect(receivedMessages.length).toBe(1);
    const resp = receivedMessages[0];
    expect(resp.id).toBe(1);
    expect(resp.result.capabilities.hoverProvider).toBe(true);
    expect(resp.result.capabilities.definitionProvider).toBe(true);
    expect(resp.result.capabilities.completionProvider).toBeDefined();
    expect(resp.result.capabilities.semanticTokensProvider).toBeDefined();
  });

  test("full document lifecycle: open, completion, hover, and shutdown", async () => {
    // 1. Initialize
    sendClientMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { rootUri: "file:///test" },
    });

    // 2. didOpen
    const docUri = "file:///test/main.hkd";
    sendClientMessage({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: docUri,
          languageId: "hkd",
          version: 1,
          text: "fn add(a, b) {\n    return a + b\n}\n",
        },
      },
    });

    // 3. completion
    sendClientMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "textDocument/completion",
      params: {
        textDocument: { uri: docUri },
        position: { line: 3, character: 0 },
      },
    });

    // 4. hover
    sendClientMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "textDocument/hover",
      params: {
        textDocument: { uri: docUri },
        position: { line: 0, character: 4 }, // on 'add'
      },
    });

    // 5. shutdown
    sendClientMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "shutdown",
    });

    await new Promise((r) => setTimeout(r, 200));

    const completionResp = receivedMessages.find((m) => m.id === 2);
    expect(completionResp).toBeDefined();
    expect(Array.isArray(completionResp.result)).toBe(true);

    const hoverResp = receivedMessages.find((m) => m.id === 3);
    expect(hoverResp).toBeDefined();
    expect(hoverResp.result).not.toBeNull();

    const shutdownResp = receivedMessages.find((m) => m.id === 4);
    expect(shutdownResp).toBeDefined();
    expect(shutdownResp.result).toBeNull();
  });
});
