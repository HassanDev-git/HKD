import { PassThrough } from "stream";
import * as fs from "fs";
import * as path from "path";
import { DapTransport } from "../../src/debug/dap-protocol.js";
import { DebugSession } from "../../src/debug/debug-session.js";

describe("HKD DAP — Advanced Stepping Engine (Step Over, Step In, Step Out)", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let transport: DapTransport;
  let session: DebugSession;
  let receivedMessages: any[] = [];
  const testScriptPath = path.resolve("tests", "fixtures", "stepping_target.hkd");

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
    const dir = path.dirname(testScriptPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      testScriptPath,
      `
fn add(x, y) {
    let sum = x + y
    return sum
}

let num1 = 10
let num2 = 20
let result = add(num1, num2)
print(result)
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

  test("step into function call and step out back to caller", async () => {
    // 1. Initialize
    sendClientRequest("initialize", {}, 1);

    // 2. Launch
    sendClientRequest("launch", { program: testScriptPath }, 2);

    // 3. Breakpoint at line 9 (let result = add(num1, num2))
    sendClientRequest(
      "setBreakpoints",
      {
        source: { path: testScriptPath },
        breakpoints: [{ line: 9 }],
      },
      3
    );

    // 4. Configuration done -> runs to line 9
    sendClientRequest("configurationDone", {}, 4);
    await new Promise((r) => setTimeout(r, 100));

    let stopped = receivedMessages.find((m) => m.type === "event" && m.event === "stopped");
    expect(stopped).toBeDefined();
    expect(stopped.body.reason).toBe("breakpoint");

    // 5. Step In -> enters add function body at line 3
    sendClientRequest("stepIn", { threadId: 1 }, 5);
    await new Promise((r) => setTimeout(r, 100));

    // 6. Query stack trace to verify we are inside 'add'
    sendClientRequest("stackTrace", { threadId: 1 }, 6);
    await new Promise((r) => setTimeout(r, 50));

    const stackResp = receivedMessages.find((m) => m.command === "stackTrace");
    expect(stackResp).toBeDefined();
    expect(stackResp.body.stackFrames[0].name).toBe("add");

    // 7. Step Out -> returns to top-level script
    sendClientRequest("stepOut", { threadId: 1 }, 7);
    await new Promise((r) => setTimeout(r, 100));

    // 8. Continue to completion
    sendClientRequest("continue", { threadId: 1 }, 8);
    await new Promise((r) => setTimeout(r, 100));

    const termEvent = receivedMessages.find((m) => m.type === "event" && m.event === "terminated");
    expect(termEvent).toBeDefined();
  });
});
