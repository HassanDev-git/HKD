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
const TEMP_FILE = path.resolve(process.cwd(), "temp_stdlib_test.hkdb");

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
  let nativeErr: string | undefined;

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
          } else {
            nativeOk = false;
            nativeErr = res.stderr || "Native runtime exit code non-zero";
          }
        }
      }
    }
  } catch (err: any) {
    nativeOk = false;
    nativeErr = err.message;
  } finally {
    if (fs.existsSync(TEMP_FILE)) {
      fs.unlinkSync(TEMP_FILE);
    }
  }

  // Assert side-by-side output parity
  if (result.ok) {
    expect(nativeOk).toBe(true);
    const stdLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    expect(nativeLines).toEqual(stdLines);
  }

  return { output: lines, ok: result.ok, error: result.error };
}

describe("HKD Standard Library Parity Tests", () => {
  test("math module", () => {
    run(`
      import math
      print(math.abs(-42))
      print(math.ceil(4.2))
      print(math.floor(4.7))
      print(math.round(4.5))
      print(math.sqrt(16))
      print(math.sin(0))
      print(math.cos(0))
      print(math.min(10, 20))
      print(math.max(10, 20))
      print(math.pow(2, 3))
    `);
  });

  test("string module", () => {
    run(`
      import string
      print(string.len("hello"))
      print(string.upper("hello"))
      print(string.lower("HELLO"))
      print(string.trim("  hello  "))
      print(string.contains("hello world", "world"))
      print(string.starts_with("hello world", "hello"))
      print(string.ends_with("hello world", "world"))
      print(string.replace("hello world", "world", "friend"))
    `);
  });

  test("array module", () => {
    run(`
      import array
      let a = [1, 2, 3]
      array.push(a, 4)
      print(array.len(a))
      print(array.pop(a))
      print(array.len(a))
      print(array.join(a, "-"))
    `);
  });

  test("json module", () => {
    run(`
      import json
      let s = json.stringify({ val: 123, list: [1, 2] })
      let obj = json.parse(s)
      print(obj.val)
      print(obj.list[1])
    `);
  });

  test("path module", () => {
    run(`
      import path
      print(path.basename("src/main.hkd"))
      print(path.extname("src/main.hkd"))
      print(path.is_absolute("src/main.hkd"))
    `);
  });

  test("env module", () => {
    run(`
      import env
      env.set("TEST_VAR", "hello_env")
      print(env.get("TEST_VAR"))
    `);
  });

  test("random module", () => {
    run(`
      import random
      let f = random.float()
      print(f >= 0 && f <= 1)
      let i = random.int(10, 20)
      print(i >= 10 && i <= 20)
    `);
  });
});
