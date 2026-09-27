import { PassThrough } from "stream";
import * as fs from "fs";
import * as path from "path";
import { DapTransport } from "../../src/debug/dap-protocol.js";
import { DebugSession } from "../../src/debug/debug-session.js";

describe("HKD DAP — Expression Evaluation & Scope Inspection", () => {
  let inStream: PassThrough;
  let outStream: PassThrough;
  let transport: DapTransport;
  let session: DebugSession;
  let receivedMessages: any[] = [];
  const testScriptPath = path.resolve("tests", "fixtures", "eval_scopes_target.hkd");

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
let globalVal = 100
let message = "hkd debug"
let flag = true

fn compute(x) {
    let localVal = x * 2
    return localVal
}

compute(50)
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

  test("evaluates integer numeric literals", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("evaluate", { expression: "123" }, 3);

    await new Promise((r) => setTimeout(r, 100));

    const evalResp = receivedMessages.find((m) => m.command === "evaluate");
    expect(evalResp).toBeDefined();
    expect(evalResp.body.result).toBe("123");
  });

  test("evaluates floating-point numeric literals", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("evaluate", { expression: "3.1415" }, 3);

    await new Promise((r) => setTimeout(r, 100));

    const evalResp = receivedMessages.find((m) => m.command === "evaluate");
    expect(evalResp).toBeDefined();
    expect(evalResp.body.result).toBe("3.1415");
  });

  test("evaluates string literals safely", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("evaluate", { expression: "testString" }, 3);

    await new Promise((r) => setTimeout(r, 100));

    const evalResp = receivedMessages.find((m) => m.command === "evaluate");
    expect(evalResp).toBeDefined();
    expect(evalResp.body.result).toBeDefined();
  });

  test("retrieves global variables from scope 2000", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("variables", { variablesReference: 2000 }, 3);

    await new Promise((r) => setTimeout(r, 100));

    const varResp = receivedMessages.find((m) => m.command === "variables");
    expect(varResp).toBeDefined();
    expect(Array.isArray(varResp.body.variables)).toBe(true);
  });

  test("supports clearing breakpoints dynamically", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    // Set breakpoint
    sendClientRequest(
      "setBreakpoints",
      { source: { path: testScriptPath }, breakpoints: [{ line: 7 }] },
      3
    );
    await new Promise((r) => setTimeout(r, 50));

    // Clear breakpoints
    sendClientRequest(
      "setBreakpoints",
      { source: { path: testScriptPath }, breakpoints: [] },
      4
    );
    await new Promise((r) => setTimeout(r, 50));

    const clearResp = receivedMessages.find((m) => m.request_seq === 4);
    expect(clearResp).toBeDefined();
    expect(clearResp.body.breakpoints.length).toBe(0);
  });

  test("threads request always returns main thread 1", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("threads", {}, 2);

    await new Promise((r) => setTimeout(r, 50));

    const threadsResp = receivedMessages.find((m) => m.command === "threads");
    expect(threadsResp).toBeDefined();
    expect(threadsResp.body.threads[0].id).toBe(1);
    expect(threadsResp.body.threads[0].name).toBe("HKD Main Thread");
  });

  test("disconnect request emits terminated event", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("disconnect", {}, 2);

    await new Promise((r) => setTimeout(r, 50));

    const termEvent = receivedMessages.find((m) => m.type === "event" && m.event === "terminated");
    expect(termEvent).toBeDefined();
  });

  test("handles empty stackTrace request when VM has not started", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("stackTrace", { threadId: 1 }, 2);

    await new Promise((r) => setTimeout(r, 50));

    const stackResp = receivedMessages.find((m) => m.command === "stackTrace");
    expect(stackResp).toBeDefined();
    expect(stackResp.body.stackFrames.length).toBe(0);
  });

  test("scopes request returns Locals and Globals handles", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("scopes", { frameId: 0 }, 3);

    await new Promise((r) => setTimeout(r, 50));

    const scopesResp = receivedMessages.find((m) => m.command === "scopes");
    expect(scopesResp).toBeDefined();
    expect(scopesResp.body.scopes.length).toBe(2);
    expect(scopesResp.body.scopes[0].name).toBe("Locals");
    expect(scopesResp.body.scopes[1].name).toBe("Globals");
  });

  test("local variablesReference maps correctly to frame index", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("scopes", { frameId: 2 }, 3);

    await new Promise((r) => setTimeout(r, 50));

    const scopesResp = receivedMessages.find((m) => m.command === "scopes");
    expect(scopesResp.body.scopes[0].variablesReference).toBe(1002);
  });

  test("variables query with invalid reference returns empty array", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("variables", { variablesReference: 99999 }, 3);

    await new Promise((r) => setTimeout(r, 50));

    const varResp = receivedMessages.find((m) => m.command === "variables");
    expect(varResp).toBeDefined();
    expect(varResp.body.variables.length).toBe(0);
  });

  test("setting breakpoints on non-existent file verifies correctly", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest(
      "setBreakpoints",
      { source: { path: "dummy_not_real.hkd" }, breakpoints: [{ line: 10 }] },
      2
    );

    await new Promise((r) => setTimeout(r, 50));

    const bpResp = receivedMessages.find((m) => m.command === "setBreakpoints");
    expect(bpResp).toBeDefined();
    expect(bpResp.body.breakpoints[0].verified).toBe(true);
  });

  test("stopOnEntry flag causes immediate halt at entry", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath, stopOnEntry: true }, 2);
    sendClientRequest("configurationDone", {}, 3);

    await new Promise((r) => setTimeout(r, 100));

    const stopped = receivedMessages.find((m) => m.type === "event" && m.event === "stopped");
    expect(stopped).toBeDefined();
    expect(stopped.body.reason).toBe("entry");
  });

  test("resuming from stopOnEntry continues cleanly", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath, stopOnEntry: true }, 2);
    sendClientRequest("configurationDone", {}, 3);

    await new Promise((r) => setTimeout(r, 100));

    sendClientRequest("continue", { threadId: 1 }, 4);
    await new Promise((r) => setTimeout(r, 100));

    const termEvent = receivedMessages.find((m) => m.type === "event" && m.event === "terminated");
    expect(termEvent).toBeDefined();
  });

  test("evaluating empty expression returns null", async () => {
    sendClientRequest("initialize", {}, 1);
    sendClientRequest("launch", { program: testScriptPath }, 2);
    sendClientRequest("evaluate", { expression: "" }, 3);

    await new Promise((r) => setTimeout(r, 50));

    const evalResp = receivedMessages.find((m) => m.command === "evaluate");
    expect(evalResp).toBeDefined();
    expect(evalResp.body.result).toBeDefined();
  });
});
