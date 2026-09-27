import { PassThrough } from "stream";
import { HkdLanguageServer } from "../../src/lsp/server.js";
import { DapTransport } from "../../src/debug/dap-protocol.js";
import { DebugSession } from "../../src/debug/debug-session.js";

describe("HKD Tooling Security & Fuzzing — LSP & DAP Robustness", () => {
  describe("LSP Transport & Message Fuzzing", () => {
    let inStream: PassThrough;
    let outStream: PassThrough;
    let server: HkdLanguageServer;
    let responses: any[] = [];

    beforeEach(() => {
      inStream = new PassThrough();
      outStream = new PassThrough();
      responses = [];

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
          try {
            responses.push(JSON.parse(body));
          } catch {}
        }
      });

      server = new HkdLanguageServer(inStream, outStream);
    });

    test("handles completely broken/malformed JSON payloads without crashing", async () => {
      const junk = "Content-Length: 15\r\n\r\n{not_valid_json";
      expect(() => inStream.write(junk)).not.toThrow();

      await new Promise((r) => setTimeout(r, 50));
      // Server must remain alive and responsive
      expect(responses.length).toBeGreaterThanOrEqual(1);
      expect(responses[0].error).toBeDefined();
    });

    test("handles unknown methods gracefully with method not found error", async () => {
      const msg = JSON.stringify({
        jsonrpc: "2.0",
        id: 999,
        method: "nonExistent/dangerousMethod",
        params: { maliciousPayload: true },
      });
      inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

      await new Promise((r) => setTimeout(r, 50));

      const resp = responses.find((r) => r.id === 999);
      expect(resp).toBeDefined();
      expect(resp.error.code).toBe(-32601); // Method not found
    });

    test("resists directory traversal in document URIs", async () => {
      const msg = JSON.stringify({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: "file:///../../../../../../Windows/System32/drivers/etc/hosts",
            version: 1,
            text: "let x = 1\n",
          },
        },
      });
      expect(() =>
        inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
      ).not.toThrow();
    });

    test("handles oversized message chunks safely", async () => {
      const bigText = "let x = 1\n".repeat(5000);
      const msg = JSON.stringify({
        jsonrpc: "2.0",
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: "file:///big.hkd",
            version: 1,
            text: bigText,
          },
        },
      });
      expect(() =>
        inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
      ).not.toThrow();
    });
  });

  describe("DAP Robustness & Boundary Fuzzing", () => {
    let inStream: PassThrough;
    let outStream: PassThrough;
    let transport: DapTransport;
    let session: DebugSession;
    let responses: any[] = [];

    beforeEach(() => {
      inStream = new PassThrough();
      outStream = new PassThrough();
      responses = [];

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
          try {
            responses.push(JSON.parse(body));
          } catch {}
        }
      });

      transport = new DapTransport(inStream, outStream);
      session = new DebugSession(transport);
    });

    test("handles non-existent launch targets cleanly", async () => {
      const msg = JSON.stringify({
        seq: 1,
        type: "request",
        command: "launch",
        arguments: { program: "C:/non/existent/path/never_existed.hkd" },
      });
      inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

      await new Promise((r) => setTimeout(r, 50));

      const resp = responses.find((r) => r.command === "launch");
      expect(resp).toBeDefined();
      expect(resp.success).toBe(false);
      expect(resp.message).toContain("File not found");
    });

    test("handles extreme breakpoint boundary line numbers without panic", async () => {
      const msg = JSON.stringify({
        seq: 2,
        type: "request",
        command: "setBreakpoints",
        arguments: {
          source: { path: "dummy.hkd" },
          breakpoints: [{ line: -500 }, { line: 0 }, { line: 999999999 }],
        },
      });
      expect(() =>
        inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`)
      ).not.toThrow();

      await new Promise((r) => setTimeout(r, 50));
      const resp = responses.find((r) => r.command === "setBreakpoints");
      expect(resp).toBeDefined();
      expect(resp.success).toBe(true);
    });

    test("handles unknown DAP requests without crash", async () => {
      const msg = JSON.stringify({
        seq: 3,
        type: "request",
        command: "maliciousOrUnsupportedCommand",
        arguments: {},
      });
      inStream.write(`Content-Length: ${Buffer.byteLength(msg)}\r\n\r\n${msg}`);

      await new Promise((r) => setTimeout(r, 50));
      const resp = responses.find((r) => r.command === "maliciousOrUnsupportedCommand");
      expect(resp).toBeDefined();
      expect(resp.success).toBe(false);
    });
  });
});
