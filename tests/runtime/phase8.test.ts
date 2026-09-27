import { runSource } from "../../src/runtime/index";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";

const RUNTIME_PATH = path.resolve(__dirname, "../../native-runtime/zig-out/bin/hkd-runtime.exe");
const TEMP_FILE = path.resolve(process.cwd(), "temp_phase8_test.hkdb");

function run(source: string): { output: string[]; ok: boolean; error?: string } {
  // 1. Run reference VM
  const lines: string[] = [];
  const result = runSource(source, {
    fileName: "<test>",
    output: (s) => lines.push(s),
    printDiagnostics: false,
  });

  // 2. Run native VM differentially
  let nativeLines: string[] = [];
  let nativeOk = false;

  try {
    const reporter = new ErrorReporter(source, "<test>");
    const lexer = new Lexer(source, "<test>", reporter);
    const tokens = lexer.tokenize();
    if (!reporter.hasErrors()) {
      const parser = new Parser(tokens, source, "<test>", reporter);
      const ast = parser.parse();
      if (!reporter.hasErrors()) {
        const analyser = new SemanticAnalyser(reporter, source);
        analyser.analyse(ast);
        if (!reporter.hasErrors()) {
          const compiler = new Compiler(reporter);
          const chunk = compiler.compile(ast);
          const binary = serializeProgram(chunk);
          fs.writeFileSync(TEMP_FILE, binary);

          const res = spawnSync(RUNTIME_PATH, [TEMP_FILE], { encoding: "utf-8" });
          if (res.status === 0) {
            nativeOk = true;
            if (res.stdout) {
              nativeLines = res.stdout.trim().split("\n").map(l => l.trim()).filter(l => l.length > 0);
            }
          }
        }
      }
    }
  } finally {
    if (fs.existsSync(TEMP_FILE)) {
      fs.unlinkSync(TEMP_FILE);
    }
  }

  if (result.ok) {
    expect(nativeOk).toBe(true);
    const stdLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    expect(nativeLines).toEqual(stdLines);
  }

  return { output: lines, ok: result.ok, error: result.error };
}

describe("Phase 8 Systems Runtime & Modules Parity Tests", () => {
  test("buffer module creation and len property", () => {
    const res = run(`
      import buffer
      let buf = buffer.from_string("hello")
      print(buf.len)
    `);
    expect(res.output).toEqual(["5"]);
  });

  test("buffer new allocation with default size", () => {
    const res = run(`
      import buffer
      let b = buffer.alloc(16)
      print(b.len)
    `);
    expect(res.output).toEqual(["16"]);
  });

  test("task sleep executes cleanly", () => {
    const res = run(`
      import task
      task.sleep(5)
      print("slept")
    `);
    expect(res.output).toEqual(["slept"]);
  });

  test("process execution via argument vectors", () => {
    const res = run(`
      import process
      let proc = process.run(["node", "-v"])
      print(proc.exit_code)
    `);
    expect(res.output).toEqual(["0"]);
  });

  test("http module health check returns 200 status", () => {
    const res = run(`
      import http
      let resp = http.get("127.0.0.1", 8080, "/health")
      print(resp.status)
    `);
    expect(res.output).toEqual(["200"]);
  });

  test("http module unreachable endpoint returns 500 error", () => {
    const res = run(`
      import http
      let resp = http.get("127.0.0.1", 8080, "/unreachable")
      print(resp.status)
    `);
    expect(res.output).toEqual(["500"]);
  });

  test("ffi library check returns null for non-existent path", () => {
    const res = run(`
      import ffi
      let ok = ffi.open("non_existent_library_hkd_xyz.dll")
      print(ok)
    `);
    expect(res.output).toEqual(["null"]);
  });
});
