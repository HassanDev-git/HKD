const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const cli = path.join(root, "dist", "cli", "main.js");
const result = spawnSync(process.execPath, [cli, "doctor", "--json"], {
  cwd: root,
  encoding: "utf8",
  timeout: 30000,
});
assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const report = JSON.parse(result.stdout);
const checks = new Map(report.checks.map((check) => [check.name, check]));
assert.equal(checks.get("HKD Bytecode Compiler & Stack VM")?.status, "ok");
assert.equal(checks.get("HKD Language Server Protocol 2.0 (LSP)")?.status, "ok");
assert.equal(checks.get("HKD Debug Adapter Protocol (DAP)")?.status, "ok");
const container = checks.get("Container & Multi-Stage Deployment");
assert.equal(container?.status, "warn", "Doctor must not claim it executed a container");
assert.match(container?.message ?? "", /not tested by Doctor/);
assert.match(checks.get("Package Manager & Cache Subsystem")?.message ?? "", /cache is configured/);
assert.match(checks.get("Security, Fuzzing & Audit Engine")?.message ?? "", /no security scan was run/);
assert.notEqual(checks.get("VS Code Extension Manifest")?.status, "error", "extension manifest presence must not imply a compiled extension");
assert.equal(report.allOk, true);
const runtime = checks.get("Native Zig Bytecode Runtime");
if (runtime?.status === "warn") assert.match(runtime.message, /optional/i);
console.log("Development Doctor smoke passed: compiler, LSP, DAP, extension state, and optional native runtime.");
