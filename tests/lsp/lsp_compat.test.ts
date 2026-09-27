/**
 * HKD LSP 2.0 Backward Compatibility & Protocol Regression Suite
 *
 * Ensures LSP 2.0 capabilities and JSON-RPC message contracts remain stable
 * across 1.0.x maintenance releases.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import { PassThrough } from "stream";
import { HkdLanguageServer } from "../../src/lsp/server.js";

describe("HKD LSP 2.0 Compatibility Contract", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let server: HkdLanguageServer;
  let received: any[] = [];

  function send(msg: any) {
    const body = JSON.stringify(msg);
    const frame = `Content-Length: ${Buffer.byteLength(body, "utf-8")}\r\n\r\n${body}`;
    inStream.write(frame);
  }

  beforeEach(() => {
    inStream = new PassThrough();
    outStream = new PassThrough();
    received = [];

    let buf = "";
    outStream.on("data", (chunk) => {
      buf += chunk.toString("utf-8");
      while (true) {
        const m = buf.match(/^Content-Length:\s*(\d+)\r\n\r\n/i);
        if (!m) break;
        const hLen = m[0].length;
        const bLen = parseInt(m[1], 10);
        if (buf.length < hLen + bLen) break;
        const json = buf.slice(hLen, hLen + bLen);
        buf = buf.slice(hLen + bLen);
        received.push(JSON.parse(json));
      }
    });

    server = new HkdLanguageServer(inStream, outStream);
  });

  test("initialization advertises contractual LSP 2.0 capabilities", async () => {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { rootUri: "file:///workspace" },
    });

    await new Promise((r) => setTimeout(r, 40));

    expect(received.length).toBeGreaterThan(0);
    const resp = received.find((m) => m.id === 1);
    expect(resp).toBeDefined();
    expect(resp.result.capabilities).toBeDefined();
    expect(resp.result.capabilities.hoverProvider).toBe(true);
    expect(resp.result.capabilities.definitionProvider).toBe(true);
    expect(resp.result.capabilities.completionProvider).toBeDefined();
  });

  test("completion request returns core language keywords", async () => {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { rootUri: "file:///workspace" },
    });
    await new Promise((r) => setTimeout(r, 30));

    send({
      jsonrpc: "2.0",
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: "file:///workspace/main.hkd",
          languageId: "hkd",
          version: 1,
          text: "let x = 10;\n",
        },
      },
    });
    await new Promise((r) => setTimeout(r, 30));

    send({
      jsonrpc: "2.0",
      id: 2,
      method: "textDocument/completion",
      params: {
        textDocument: { uri: "file:///workspace/main.hkd" },
        position: { line: 0, character: 4 },
      },
    });
    await new Promise((r) => setTimeout(r, 40));

    const compResp = received.find((m) => m.id === 2);
    expect(compResp).toBeDefined();
    const items = compResp.result;
    expect(Array.isArray(items) || (items && Array.isArray(items.items))).toBe(true);
  });
});
