/**
 * HKD Phase 9C: Register VM Architecture Experiment & Parity Verification
 *
 * Verifies correctness and semantic parity of the Register VM against the reference Stack VM.
 */

import { runSource } from "../../src/runtime/index.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { Parser } from "../../src/parser/parser.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { ErrorReporter } from "../../src/errors/index.js";

function executeWithVm(source: string, vm: "stack" | "register") {
  const output: string[] = [];
  const res = runSource(source, {
    output: (s) => output.push(s),
    printDiagnostics: false,
    vm,
  });
  return { ok: res.ok, value: res.value, output, error: res.error };
}

function assertParity(source: string) {
  const stackRes = executeWithVm(source, "stack");
  const regRes = executeWithVm(source, "register");

  expect(regRes.ok).toBe(stackRes.ok);
  expect(regRes.output).toEqual(stackRes.output);
  if (stackRes.ok) {
    expect(regRes.value).toEqual(stackRes.value);
  }
}

describe("Phase 9C: Register VM Functionality & Parity", () => {
  test("Arithmetic integer & float parity", () => {
    assertParity(`
      let a = 10
      let b = 25
      let c = a + b * 2 - (b / 5)
      print(c)
      let d = 3.14 * 2.0 + 1.5
      print(d)
    `);
  });

  test("Logical & bitwise parity", () => {
    assertParity(`
      let a = 12
      let b = 5
      print(a & b)
      print(a | b)
      print(a ^ b)
      print(a << 2)
      print(a >> 1)
      print(!true)
      print(!false)
    `);
  });

  test("Conditionals & branching parity", () => {
    assertParity(`
      fn check(x) {
        if x > 10 {
          return "greater"
        } else if x == 10 {
          return "equal"
        } else {
          return "less"
        }
      }
      print(check(15))
      print(check(10))
      print(check(5))
    `);
  });

  test("While loops & mutation parity", () => {
    assertParity(`
      let i = 0
      let sum = 0
      while i < 100 {
        sum = sum + i
        i = i + 1
      }
      print(sum)
    `);
  });

  test("For-in loop & iterator parity", () => {
    assertParity(`
      let sum = 0
      for x in [10, 20, 30, 40] {
        sum = sum + x
      }
      print(sum)
    `);
  });

  test("Function calls & recursion parity", () => {
    assertParity(`
      fn fib(n) {
        if n <= 1 { return n }
        return fib(n - 1) + fib(n - 2)
      }
      print(fib(10))
    `);
  });

  test("Self-tail call optimization parity", () => {
    assertParity(`
      fn loopSum(n, acc) {
        if n <= 0 { return acc }
        return loopSum(n - 1, acc + n)
      }
      print(loopSum(50, 0))
    `);
  });

  test("Closures and upvalue capture parity", () => {
    assertParity(`
      fn makeCounter(init) {
        let count = init
        return fn() {
          count = count + 1
          return count
        }
      }
      let c1 = makeCounter(10)
      print(c1())
      print(c1())
      print(c1())
    `);
  });

  test("Array operations parity", () => {
    assertParity(`
      let arr = [1, 2, 3]
      arr.push(4)
      print(arr.length)
      print(arr[0])
      print(arr[3])
      arr[1] = 99
      print(arr[1])
      print(arr.join("-"))
    `);
  });

  test("Object fields & method calls parity", () => {
    assertParity(`
      let p = { x: 10, y: 20 }
      print(p.x + p.y)
      p.x = 50
      print(p.x)
    `);
  });

  test("String interpolation and methods parity", () => {
    assertParity(`
      let s = "  hello world  "
      print(s.trim().upper())
      print(s.contains("world"))
      print(s.replace("world", "HKD").trim())
    `);
  });

  test("Standard library math parity", () => {
    assertParity(`
      import math
      print(math.sqrt(16))
      print(math.abs(-42))
      print(math.max(10, 20))
    `);
  });

  test("Error parity on division by zero", () => {
    const stackRes = executeWithVm("let x = 10 / 0", "stack");
    const regRes = executeWithVm("let x = 10 / 0", "register");
    expect(regRes.ok).toBe(false);
    expect(stackRes.ok).toBe(false);
    expect(regRes.error).toContain("Division by zero");
  });

  test("Bytecode lowering inspection", () => {
    const src = "let x = 1 + 2 * 3; print(x)";
    const reporter = new ErrorReporter(src, "<test>");
    const lexer = new Lexer(src, "<test>", reporter);
    const parser = new Parser(lexer.tokenize(), src, "<test>", reporter);
    const ast = parser.parse();
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const regChunk = lowerToRegisterChunk(chunk);

    expect(regChunk.code.length).toBeGreaterThan(0);
    expect(regChunk.registerCount).toBeGreaterThan(0);
    const dis = regChunk.disassemble();
    expect(dis).toContain("LoadConst");
  });
});
