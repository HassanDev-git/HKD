/**
 * HKD DAP Protocol Compatibility & Regression Test Suite
 *
 * Asserts DAP protocol handshake, breakpoint configuration, and lifecycle.
 */

import { describe, test, expect, beforeEach } from "@jest/globals";
import { PassThrough } from "stream";
import { DapTransport } from "../../src/debug/dap-protocol.js";
import { DebugSession } from "../../src/debug/debug-session.js";

describe("HKD DAP Compatibility Contract", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let transport: DapTransport;
  let session: DebugSession;
  let received: any[] = [];

  function send(command: string, args: any = {}, seq = 1) {
    const json = JSON.stringify({
      seq,
      type: "request",
      command,
      arguments: args,
    });
    const frame = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n${json}`;
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
        const body = buf.slice(hLen, hLen + bLen);
        buf = buf.slice(hLen + bLen);
        received.push(JSON.parse(body));
      }
    });

    transport = new DapTransport(inStream, outStream);
    session = new DebugSession(transport);
  });

  test("DAP initialize request advertises required debugger capabilities", async () => {
    send("initialize", { clientID: "vscode", adapterID: "hkd" }, 1);

    await new Promise((r) => setTimeout(r, 40));

    const resp = received.find((m) => m.command === "initialize");
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    expect(resp.body.supportsConfigurationDoneRequest).toBe(true);
  });

  test("setBreakpoints accepts breakpoint list and returns verification", async () => {
    send("initialize", {}, 1);
    await new Promise((r) => setTimeout(r, 20));

    send(
      "setBreakpoints",
      {
        source: { path: "dummy.hkd" },
        breakpoints: [{ line: 5 }, { line: 10 }],
      },
      2
    );
    await new Promise((r) => setTimeout(r, 40));

    const resp = received.find((m) => m.command === "setBreakpoints");
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    expect(resp.body.breakpoints.length).toBe(2);
  });
});
