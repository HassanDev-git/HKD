import { runSource } from "../../src/runtime/index";
import { HkdValue } from "../../src/bytecode/chunk";
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
const TEMP_FILE = path.resolve(process.cwd(), "temp_test_run.hkdb");

function compileHkdFile(filePath: string, outPath: string) {
  const source = fs.readFileSync(filePath, "utf-8");
  const reporter = new ErrorReporter(source, filePath);
  const lexer = new Lexer(source, filePath, reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, filePath, reporter);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);
  const binary = serializeProgram(chunk);
  fs.writeFileSync(outPath, binary);
}

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
  const compiledFiles: string[] = [];

  try {
    // Compile any adjacent .hkd files to .hkdb so the native VM can resolve imports
    const files = fs.readdirSync(process.cwd()).filter(f => f.endsWith(".hkd") && f !== "temp_test_run.hkd");
    for (const f of files) {
      const out = f.replace(/\.hkd$/, ".hkdb");
      try {
        compileHkdFile(f, out);
        compiledFiles.push(out);
      } catch {}
    }

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
    for (const f of compiledFiles) {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
      }
    }
  }

  // 3. Assert side-by-side output parity
  if (result.ok) {
    expect(nativeOk).toBe(true);
    const stdLines = lines.map(l => l.trim()).filter(l => l.length > 0);
    expect(nativeLines).toEqual(stdLines);
  }

  return { output: lines, ok: result.ok, error: result.error };
}

function runValue(source: string): HkdValue {
  const lines: string[] = [];
  const result = runSource(source, {
    fileName: "<test>",
    output: (s) => lines.push(s),
    printDiagnostics: false,
  });
  return result.value ?? null;
}

// ─── Basic output ─────────────────────────────────────────────────────────────

describe("Runtime — Basic Output", () => {
  test("hello world", () => {
    const { output, ok } = run('print("Hello, World")');
    expect(ok).toBe(true);
    expect(output).toEqual(["Hello, World"]);
  });

  test("print multiple args", () => {
    const { output } = run('print("a", "b", "c")');
    expect(output[0]).toBe("a b c");
  });

  test("print integer", () => {
    const { output } = run("print(42)");
    expect(output[0]).toBe("42");
  });
});

// ─── Variables ────────────────────────────────────────────────────────────────

describe("Runtime — Variables", () => {
  test("let declaration and use", () => {
    const { output } = run('let x = 10\nprint(x)');
    expect(output[0]).toBe("10");
  });

  test("variable reassignment", () => {
    const { output } = run('let x = 1\nx = 2\nprint(x)');
    expect(output[0]).toBe("2");
  });

  test("multiple variables", () => {
    const { output } = run('let a = 1\nlet b = 2\nprint(a + b)');
    expect(output[0]).toBe("3");
  });

  test("string concatenation", () => {
    const { output } = run('let s = "hello" + " " + "world"\nprint(s)');
    expect(output[0]).toBe("hello world");
  });
});

// ─── Arithmetic ───────────────────────────────────────────────────────────────

describe("Runtime — Arithmetic", () => {
  test("addition", () => {
    const { output } = run("print(2 + 3)");
    expect(output[0]).toBe("5");
  });

  test("subtraction", () => {
    const { output } = run("print(10 - 3)");
    expect(output[0]).toBe("7");
  });

  test("multiplication", () => {
    const { output } = run("print(4 * 5)");
    expect(output[0]).toBe("20");
  });

  test("division", () => {
    const { output } = run("print(10 / 4)");
    expect(output[0]).toBe("2.5");
  });

  test("modulo", () => {
    const { output } = run("print(10 % 3)");
    expect(output[0]).toBe("1");
  });

  test("exponentiation", () => {
    const { output } = run("print(2 ** 8)");
    expect(output[0]).toBe("256");
  });

  test("operator precedence: * before +", () => {
    const { output } = run("print(2 + 3 * 4)");
    expect(output[0]).toBe("14");
  });

  test("parentheses override precedence", () => {
    const { output } = run("print((2 + 3) * 4)");
    expect(output[0]).toBe("20");
  });

  test("unary negation", () => {
    const { output } = run("print(-5)");
    expect(output[0]).toBe("-5");
  });
});

// ─── Functions ────────────────────────────────────────────────────────────────

describe("Runtime — Functions", () => {
  test("basic function call", () => {
    const { output } = run('fn greet() { print("hello") }\ngreet()');
    expect(output[0]).toBe("hello");
  });

  test("function with parameters", () => {
    const { output } = run('fn add(a, b) { return a + b }\nprint(add(3, 4))');
    expect(output[0]).toBe("7");
  });

  test("recursive function", () => {
    const { output } = run(`
fn factorial(n) {
    if n <= 1 { return 1 }
    return n * factorial(n - 1)
}
print(factorial(5))
    `);
    expect(output[0]).toBe("120");
  });

  test("function as value", () => {
    const { output } = run(`
fn double(x) { return x * 2 }
let f = double
print(f(5))
    `);
    expect(output[0]).toBe("10");
  });

  test("anonymous function", () => {
    const { output } = run(`
let square = fn(x) { return x * x }
print(square(7))
    `);
    expect(output[0]).toBe("49");
  });

  test("nested functions", () => {
    const { output } = run(`
fn outer(x) {
    fn inner(y) { return x + y }
    return inner(10)
}
print(outer(5))
    `);
    expect(output[0]).toBe("15");
  });
});

// ─── Control Flow ─────────────────────────────────────────────────────────────

describe("Runtime — Control Flow", () => {
  test("if true branch", () => {
    const { output } = run('if true { print("yes") }');
    expect(output[0]).toBe("yes");
  });

  test("if false skips body", () => {
    const { output } = run('if false { print("no") }');
    expect(output).toHaveLength(0);
  });

  test("if-else true branch", () => {
    const { output } = run('if true { print("yes") } else { print("no") }');
    expect(output[0]).toBe("yes");
  });

  test("if-else false branch", () => {
    const { output } = run('if false { print("yes") } else { print("no") }');
    expect(output[0]).toBe("no");
  });

  test("while loop", () => {
    const { output } = run('let i = 0\nwhile i < 3 { print(i)\ni = i + 1 }');
    expect(output).toEqual(["0", "1", "2"]);
  });

  test("for loop over array", () => {
    const { output } = run('for x in [1, 2, 3] { print(x) }');
    expect(output).toEqual(["1", "2", "3"]);
  });

  test("break in while loop", () => {
    const { output } = run(`
let i = 0
while i < 10 {
    if i == 3 { break }
    print(i)
    i = i + 1
}
    `);
    expect(output).toEqual(["0", "1", "2"]);
  });

  test("continue in while loop", () => {
    const { output } = run(`
let i = 0
while i < 5 {
    i = i + 1
    if i == 3 { continue }
    print(i)
}
    `);
    expect(output).toEqual(["1", "2", "4", "5"]);
  });
});

// ─── Arrays ───────────────────────────────────────────────────────────────────

describe("Runtime — Arrays", () => {
  test("array literal", () => {
    const { output } = run("let arr = [1, 2, 3]\nprint(arr[0])");
    expect(output[0]).toBe("1");
  });

  test("array indexing", () => {
    const { output } = run("let a = [10, 20, 30]\nprint(a[2])");
    expect(output[0]).toBe("30");
  });

  test("array length", () => {
    const { output } = run("print(len([1, 2, 3, 4]))");
    expect(output[0]).toBe("4");
  });

  test("for loop over array", () => {
    const { output } = run("for n in [5, 6, 7] { print(n) }");
    expect(output).toEqual(["5", "6", "7"]);
  });

  test("nested arrays", () => {
    const { output } = run("let m = [[1, 2], [3, 4]]\nprint(m[1][0])");
    expect(output[0]).toBe("3");
  });
});

// ─── Comparison and Logic ─────────────────────────────────────────────────────

describe("Runtime — Comparison and Logic", () => {
  test("equality", () => {
    const { output } = run("print(1 == 1)");
    expect(output[0]).toBe("true");
  });

  test("inequality", () => {
    const { output } = run("print(1 != 2)");
    expect(output[0]).toBe("true");
  });

  test("less than", () => {
    const { output } = run("print(3 < 5)");
    expect(output[0]).toBe("true");
  });

  test("logical and", () => {
    const { output } = run("print(true && false)");
    expect(output[0]).toBe("false");
  });

  test("logical or", () => {
    const { output } = run("print(false || true)");
    expect(output[0]).toBe("true");
  });

  test("logical not", () => {
    const { output } = run("print(!false)");
    expect(output[0]).toBe("true");
  });
});

// ─── Built-in Functions ───────────────────────────────────────────────────────

describe("Runtime — Built-in Functions", () => {
  test("to_string", () => {
    const { output } = run('print(to_string(42))');
    expect(output[0]).toBe("42");
  });

  test("to_int", () => {
    const { output } = run('print(to_int("123"))');
    expect(output[0]).toBe("123");
  });

  test("to_float", () => {
    const { output } = run('print(to_float("3.14"))');
    expect(output[0]).toBe("3.14");
  });

  test("len on array", () => {
    const { output } = run("print(len([1, 2, 3]))");
    expect(output[0]).toBe("3");
  });

  test("len on string", () => {
    const { output } = run('print(len("hello"))');
    expect(output[0]).toBe("5");
  });

  test("type_of int", () => {
    const { output } = run("print(type_of(42))");
    expect(output[0]).toBe("Int");
  });

  test("type_of string", () => {
    const { output } = run('print(type_of("hi"))');
    expect(output[0]).toBe("String");
  });

  test("range function", () => {
    const { output } = run("for i in range(0, 3) { print(i) }");
    expect(output).toEqual(["0", "1", "2"]);
  });
});

// ─── Error handling ───────────────────────────────────────────────────────────

describe("Runtime — Error Handling", () => {
  test("division by zero throws", () => {
    const { ok } = run("let x = 1 / 0");
    expect(ok).toBe(false);
  });

  test("undefined variable throws", () => {
    const { ok } = run("print(nonExistentVar)");
    expect(ok).toBe(false);
  });

  test("index out of bounds throws", () => {
    const { ok } = run("let a = [1, 2]\nprint(a[5])");
    expect(ok).toBe(false);
  });

  test("panic throws", () => {
    const { ok } = run('panic("something went wrong")');
    expect(ok).toBe(false);
  });
});

describe("Runtime — Phase 1 CLI, Modules, and Parser Fixes", () => {
  test("object literal with string keys", () => {
    const { output, ok } = run('let obj = { "k": 42, "s": "v" }\nprint(obj["k"])\nprint(obj["s"])');
    expect(ok).toBe(true);
    expect(output).toEqual(["42", "v"]);
  });

  test("parser avoids infinite loops on unexpected tokens at top level", () => {
    const { ok } = run('}');
    expect(ok).toBe(false);
  });

  test("parser avoids infinite loops on mismatched syntax", () => {
    const { ok } = run('let x = {');
    expect(ok).toBe(false);
  });

  test("filesystem module imports and caching", () => {
    const fs = require("fs");
    fs.writeFileSync("temp_test_module.hkd", 'export let val = 123\nexport fn get_val() { return val }');
    try {
      const { output, ok, error } = run('import temp from "temp_test_module.hkd"\nprint(temp.val)\nprint(temp.get_val())');
      if (!ok) {
        console.log("FILESYSTEM IMPORT FAILED WITH ERROR:", error);
      }
      expect(ok).toBe(true);
      expect(output).toEqual(["123", "123"]);
    } finally {
      fs.unlinkSync("temp_test_module.hkd");
    }
  });

  test("circular import detection", () => {
    const fs = require("fs");
    fs.writeFileSync("a.hkd", 'import b from "b.hkd"');
    fs.writeFileSync("b.hkd", 'import a from "a.hkd"');
    try {
      const { ok, error } = run('import a from "a.hkd"');
      expect(ok).toBe(false);
      expect(error).toContain("Circular dependency detected");
    } finally {
      fs.unlinkSync("a.hkd");
      fs.unlinkSync("b.hkd");
    }
  });
});
