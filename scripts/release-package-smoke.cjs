const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const executable = path.resolve(process.argv[2] || "");
if (!process.argv[2] || !fs.existsSync(executable)) throw new Error("Pass an existing HKD executable path");
const version = require("../package.json").version;
const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-release-smoke-"));

function run(args, expectedCode = 0) {
  const result = spawnSync(executable, args, { cwd: workspace, encoding: "utf8", timeout: 30000 });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, expectedCode, `${args.join(" ")} exited ${result.status}: ${output}`);
  return { ...result, output };
}

function frame(value) {
  const body = Buffer.from(JSON.stringify(value));
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]);
}

function parseFrames(output) {
  if (Buffer.isBuffer(output)) output = output.toString("utf8");
  const frames = [];
  let offset = 0;
  while (offset < output.length) {
    const headerEnd = output.indexOf("\r\n\r\n", offset);
    if (headerEnd < 0) break;
    const header = output.slice(offset, headerEnd);
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    if (bodyEnd > output.length) break;
    frames.push(JSON.parse(output.slice(bodyStart, bodyEnd)));
    offset = bodyEnd;
  }
  return frames;
}

function verifyProtocol(command, request) {
  const input = frame(request);
  const result = spawnSync(executable, [command], { cwd: workspace, input, encoding: null, timeout: 15000 });
  assert.equal(result.error, undefined, `${command} failed to launch: ${result.error?.message}`);
  assert.equal(result.status, 0, `${command} exited ${result.status}: ${result.stderr?.toString("utf8")}`);
  const messages = parseFrames(result.stdout);
  assert.ok(messages.some((message) => message.id === request.seq || message.id === request.id), `${command} returned no response frame`);
  if (command === "lsp") {
    const response = messages.find((message) => message.id === request.id);
    assert.ok(response?.result?.capabilities, "LSP initialize response lacks capabilities");
    assert.ok(response.result.capabilities.completionProvider, "LSP completion capability is unavailable");
  } else {
    const response = messages.find((message) => message.type === "response" && message.request_seq === request.seq);
    assert.equal(response?.success, true, `DAP initialize failed: ${JSON.stringify(response)}`);
    assert.ok(messages.some((message) => message.type === "event" && message.event === "initialized"), "DAP did not emit initialized");
  }
}

try {
  assert.match(run(["--version"]).output, new RegExp(`HKD ${version.replaceAll(".", "\\.")}`));
  assert.match(run(["--help"]).output, /USAGE:/);

  const doctor = JSON.parse(run(["doctor", "--json"]).stdout);
  const byName = new Map(doctor.checks.map((check) => [check.name, check]));
  assert.equal(byName.get("HKD Bytecode Compiler & Stack VM")?.status, "ok");
  assert.equal(byName.get("HKD Language Server Protocol 2.0 (LSP)")?.status, "ok");
  assert.equal(byName.get("HKD Debug Adapter Protocol (DAP)")?.status, "ok");
  assert.equal(byName.get("Native Zig Bytecode Runtime")?.status, "warn", "standalone package does not include the optional Zig runtime");
  assert.equal(byName.get("VS Code Extension Manifest")?.status, "warn", "extension is separate from the standalone CLI");
  assert.equal(doctor.allOk, true, "optional runtime/editor integration warnings must not fail core readiness");

  const init = run(["init", "audit-project"]);
  assert.match(init.output, /Created project/);
  const source = path.join(workspace, "audit-project", "src", "main.hkd");
  fs.writeFileSync(source, 'println("HKD release program passed")\n', "utf8");
  assert.match(run(["check", source]).output, /no errors|passed|valid/i);
  assert.match(run(["run", source]).output, /HKD release program passed/);

  const invalidSource = path.join(workspace, "invalid.hkd");
  fs.writeFileSync(invalidSource, 'let answer: int = "not an integer"\n', "utf8");
  const invalid = run(["check", invalidSource], 1);
  assert.match(invalid.output, /error|expected|type/i);

  run(["cache", "list"]);

  verifyProtocol("lsp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { processId: null, rootUri: null, capabilities: {} } });
  verifyProtocol("dap", { seq: 1, type: "request", command: "initialize", arguments: { clientID: "hkd-smoke" } });
  console.log("Standalone package smoke passed: doctor, optional integrations, init, typecheck, run, diagnostics, package cache, LSP, and DAP.");
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}
