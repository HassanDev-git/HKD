import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
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
const TEMP_FILE = path.resolve(process.cwd(), "temp_test_ic.hkdb");

function run(source: string): { output: string[]; ok: boolean } {
  const lines: string[] = [];
  const result = runSource(source, {
    fileName: "<test>",
    output: (s) => lines.push(s),
    printDiagnostics: false,
  });

  let nativeLines: string[] = [];
  let nativeOk = false;

  try {
    const reporter = new ErrorReporter(source, "<test>");
    const lexer = new Lexer(source, "<test>", reporter);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, source, "<test>", reporter);
    const ast = parser.parse();
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const binary = serializeProgram(chunk);
    fs.writeFileSync(TEMP_FILE, binary);

    const res = spawnSync(RUNTIME_PATH, [TEMP_FILE], { encoding: "utf-8" });
    if (res.status === 0) {
      nativeOk = true;
      if (res.stdout) {
        nativeLines = res.stdout.trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
      }
    }
  } finally {
    if (fs.existsSync(TEMP_FILE)) {
      fs.unlinkSync(TEMP_FILE);
    }
  }

  if (result.ok) {
    expect(nativeOk).toBe(true);
    const stdLines = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    expect(nativeLines).toEqual(stdLines);
  }

  return { output: lines, ok: result.ok };
}

describe("Phase 9F — Object & Property Optimization (Inline Caching)", () => {
  test("Repeated property accesses hit inline cache accurately", () => {
    const script = `
      let pt = { x: 10, y: 20 }
      let sum = 0
      let i = 0
      while (i < 100) {
        sum = sum + pt.x + pt.y
        i = i + 1
      }
      print(sum)
    `;

    const { output, ok } = run(script);
    expect(ok).toBe(true);
    // (10 + 20) * 100 = 3000
    expect(output[0]).toBe("3000");
  });

  test("Property write invalidates inline cache and reflects updated value", () => {
    const script = `
      let obj = { val: 42 }
      print(obj.val)
      obj.val = 99
      print(obj.val)
    `;

    const { output, ok } = run(script);
    expect(ok).toBe(true);
    expect(output[0]).toBe("42");
    expect(output[1]).toBe("99");
  });
});
