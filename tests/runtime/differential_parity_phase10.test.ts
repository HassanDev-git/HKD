import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";

const RUNTIME_PATH = path.resolve(
  process.cwd(),
  "native-runtime",
  "zig-out",
  "bin",
  process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime",
);
const CLI_PATH = path.resolve(process.cwd(), "dist", "cli", "main.js");

function compile(source: string): Buffer {
  const reporter = new ErrorReporter(source, "<native-parity>");
  const tokens = new Lexer(source, "<native-parity>", reporter).tokenize();
  const ast = new Parser(tokens, source, "<native-parity>", reporter, "2026").parse();
  if (reporter.hasErrors()) throw new Error(reporter.format());
  new SemanticAnalyser(reporter, source).analyse(ast);
  if (reporter.hasErrors()) throw new Error(reporter.format());
  return serializeProgram(new Compiler(reporter).compile(ast));
}

function outputLines(output: string): string[] {
  return output.trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function runAllSupportedModes(source: string): { reference: string[]; nativeVm: string[]; standalone: string[] } {
  const reference: string[] = [];
  const referenceResult = runSource(source, {
    fileName: "<native-parity>",
    printDiagnostics: false,
    output: (line) => reference.push(line.trim()),
  });
  expect(referenceResult.ok).toBe(true);

  if (!fs.existsSync(RUNTIME_PATH)) throw new Error(`Native runtime is required for this test: ${RUNTIME_PATH}`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-native-parity-"));
  const sourcePath = path.join(tempDir, "main.hkd");
  const bytecodePath = path.join(tempDir, "main.hkdb");
  const standalonePath = path.join(tempDir, process.platform === "win32" ? "main.exe" : "main");

  try {
    fs.writeFileSync(sourcePath, source, "utf-8");
    fs.writeFileSync(bytecodePath, compile(source));

    const vmResult = spawnSync(RUNTIME_PATH, ["--vm", bytecodePath], { encoding: "utf-8", timeout: 30000 });
    expect(vmResult.error).toBeUndefined();
    expect(vmResult.status).toBe(0);
    const nativeVm = outputLines(vmResult.stdout ?? "");

    const buildResult = spawnSync(process.execPath, [CLI_PATH, "build", "--native", sourcePath, "-o", standalonePath], {
      cwd: tempDir,
      encoding: "utf-8",
      timeout: 60000,
      env: { ...process.env, NODE_ENV: "production" },
    });
    expect(buildResult.error).toBeUndefined();
    expect(buildResult.status).toBe(0);
    if (!fs.existsSync(standalonePath)) {
      throw new Error(`Standalone build output missing at ${standalonePath}. stdout=${buildResult.stdout ?? ""} stderr=${buildResult.stderr ?? ""}`);
    }

    const standaloneResult = spawnSync(standalonePath, [], { encoding: "utf-8", timeout: 30000 });
    expect(standaloneResult.error).toBeUndefined();
    expect(standaloneResult.status).toBe(0);
    return { reference, nativeVm, standalone: outputLines(standaloneResult.stdout ?? "") };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("HKD native VM and standalone bytecode-bundle parity", () => {
  test.each([
    ["arithmetic and precedence", "print((10 + 20) * 3 - 5)", ["85"]],
    ["recursive factorial", "fn fact(n) { if (n <= 1) { return 1 } return n * fact(n - 1) } print(fact(6))", ["720"]],
    ["array operations", "let a = [10, 20, 30] a.push(40) print(a.length) print(a[0] + a[3])", ["4", "50"]],
    ["object fields", "let o = { x: 15, y: 25 } print(o.x + o.y)", ["40"]],
    ["string operations", 'let a = "Hello, " let b = "HKD!" print(a + b)', ["Hello, HKD!"]],
  ])("executes %s equivalently in the reference VM, native VM, and standalone bundle", (_name, source, expected) => {
    const modes = runAllSupportedModes(source as string);
    expect(modes.reference).toEqual(expected);
    expect(modes.nativeVm).toEqual(expected);
    expect(modes.standalone).toEqual(expected);
  });
});
