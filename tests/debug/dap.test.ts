import { PassThrough } from "stream";
import * as fs from "fs";
import * as path from "path";
import { DapTransport } from "../../src/debug/dap-protocol.js";
import { DebugSession } from "../../src/debug/debug-session.js";

describe("HKD DAP — Debug Adapter Protocol Integration", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let transport: DapTransport;
  let session: DebugSession;
  let receivedMessages: any[] = [];
  const testScriptPath = path.resolve("tests", "fixtures", "debug_target.hkd");

  function sendClientRequest(command: string, args?: any, seq = 1) {
    const json = JSON.stringify({
      seq,
      type: "request",
      command,
      arguments: args,
    });
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n${json}`;
    inStream.write(payload);
  }

  beforeAll(() => {
    // Create test fixture script
    const dir = path.dirname(testScriptPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      testScriptPath,
      `
let a = 10
let b = 20
let c = a + b
print(c)
`,
      "utf-8"
    );
  });

  afterAll(() => {
    if (fs.existsSync(testScriptPath)) fs.unlinkSync(testScriptPath);
  });

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

    transport = new DapTransport(inStream, outStream);
    session = new DebugSession(transport);
  });

  test("initialize handshake returns debug capabilities", async () => {
    sendClientRequest("initialize", { clientID: "vscode", adapterID: "hkd" }, 1);

    await new Promise((r) => setTimeout(r, 50));

    const resp = receivedMessages.find((m) => m.command === "initialize");
    expect(resp).toBeDefined();
    expect(resp.success).toBe(true);
    expect(resp.body.supportsConfigurationDoneRequest).toBe(true);
  });

  test("breakpoint hitting, stack trace, variable inspection, and continuation", async () => {
    // 1. Initialize
    sendClientRequest("initialize", {}, 1);

    // 2. Launch
    sendClientRequest("launch", { program: testScriptPath }, 2);

    // 3. Set breakpoint at line 4 (let c = a + b)
    sendClientRequest(
      "setBreakpoints",
      {
        source: { path: testScriptPath },
        breakpoints: [{ line: 4 }],
      },
      3
    );

    // 4. Configuration done -> triggers execution
    sendClientRequest("configurationDone", {}, 4);

    await new Promise((r) => setTimeout(r, 100));

    // Execution should have paused with 'stopped' event
    const stoppedEvent = receivedMessages.find((m) => m.type === "event" && m.event === "stopped");
    expect(stoppedEvent).toBeDefined();
    expect(stoppedEvent.body.reason).toBe("breakpoint");

    // 5. Query call stack
    sendClientRequest("stackTrace", { threadId: 1 }, 5);
    await new Promise((r) => setTimeout(r, 50));

    const stackResp = receivedMessages.find((m) => m.command === "stackTrace");
    expect(stackResp).toBeDefined();
    expect(stackResp.body.stackFrames.length).toBeGreaterThan(0);

    // 6. Query scopes & variables
    sendClientRequest("scopes", { frameId: 0 }, 6);
    await new Promise((r) => setTimeout(r, 50));

    const scopesResp = receivedMessages.find((m) => m.command === "scopes");
    expect(scopesResp).toBeDefined();
    expect(scopesResp.body.scopes.length).toBe(2);

    // 7. Evaluate expression
    sendClientRequest("evaluate", { expression: "42" }, 7);
    await new Promise((r) => setTimeout(r, 50));

    const evalResp = receivedMessages.find((m) => m.command === "evaluate");
    expect(evalResp).toBeDefined();
    expect(evalResp.body.result).toBe("42");

    // 8. Continue to end
    sendClientRequest("continue", { threadId: 1 }, 8);
    await new Promise((r) => setTimeout(r, 100));

    const termEvent = receivedMessages.find((m) => m.type === "event" && m.event === "terminated");
    expect(termEvent).toBeDefined();
  });
});
