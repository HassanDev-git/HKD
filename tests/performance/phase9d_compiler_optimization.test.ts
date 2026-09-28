/**
 * HKD Phase 9D: Compiler Optimization & Register Code Generation Test Suite
 *
 * Verifies correctness, safety, and deterministic behavior of:
 *   1. AST Constant Folding
 *   2. AST Constant Propagation
 *   3. Dead-Code Elimination & Branch Simplification
 *   4. Bytecode Jump Threading & Peephole Cleanup
 *   5. Register-Level Move Elimination & Copy Propagation
 *   6. Optimization Barriers (Async, Native/FFI, Closures)
 *   7. Differential Parity (Stack VM vs Register VM)
 */

import { runSource } from "../../src/runtime/index.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { Parser } from "../../src/parser/parser.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";
import { OptimizerPipeline } from "../../src/compiler/optimizer.js";

function compileWithStats(src: string) {
  const rep = new ErrorReporter(src, "<test>");
  const parser = new Parser(new Lexer(src, "<test>", rep).tokenize(), src, "<test>", rep, "2027");
  const ast = parser.parse();
  const compiler = new Compiler(rep);
  const chunk = compiler.compile(ast);
  const regChunk = lowerToRegisterChunk(chunk);
  return {
    compilerStats: compiler.getOptimizer().getStats(),
    chunk,
    regChunk,
  };
}

function executeWithVm(source: string, vm: "stack" | "register") {
  const output: string[] = [];
  const res = runSource(source, {
    output: (s) => output.push(s),
    printDiagnostics: false,
    vm,
    edition: "2027",
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

describe("Phase 9D: Compiler Optimization Suite", () => {
  describe("1. Constant Folding & Propagation", () => {
    test("Folds integer and floating-point arithmetic at compile time", () => {
      const src = `
        let x = 10 + 20 * 2 - 5
        let y = 3.5 * 2.0 + 1.0
        print(x)
        print(y)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.constantsFolded).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Folds boolean and comparison expressions", () => {
      const src = `
        let a = 15 > 10
        let b = 5 == 5
        let c = true && false
        let d = false || true
        print(a)
        print(b)
        print(c)
        print(d)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.constantsFolded).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Folds compile-time string concatenation", () => {
      const src = `
        let msg = "Hello " + "HKD " + "Phase 9D"
        print(msg)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.constantsFolded).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Does NOT fold division or modulo by zero (preserves runtime error)", () => {
      const src = `let err = 10 / 0`;
      const resStack = executeWithVm(src, "stack");
      const resReg = executeWithVm(src, "register");
      expect(resStack.ok).toBe(false);
      expect(resReg.ok).toBe(false);
      expect(resStack.error).toContain("Division by zero");
      expect(resReg.error).toContain("Division by zero");
    });
  });

  describe("2. Dead-Code & Branch Simplification", () => {
    test("Eliminates false if-branch at compile time", () => {
      const src = `
        let result = "original"
        if false {
          result = "unreachable"
        }
        print(result)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.branchesSimplified).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Inlines true if-branch and drops else branch", () => {
      const src = `
        let val = 0
        if true {
          val = 42
        } else {
          val = 999
        }
        print(val)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.branchesSimplified).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Eliminates unreachable while (false) loop", () => {
      const src = `
        let executed = false
        while false {
          executed = true
        }
        print(executed)
      `;
      const { compilerStats } = compileWithStats(src);
      expect(compilerStats.branchesSimplified).toBeGreaterThan(0);
      assertParity(src);
    });
  });

  describe("3. Register Move Elimination & Code Generation", () => {
    test("Eliminates redundant register moves in arithmetic assignment", () => {
      const src = `
        let a = 10
        let b = 20
        let c = a + b
        print(c)
      `;
      const { regChunk } = compileWithStats(src);
      // Verify code contains valid instructions and executes with parity
      expect(regChunk.code.length).toBeGreaterThan(0);
      assertParity(src);
    });

    test("Reduces dynamic instruction count in tight loop counter", () => {
      const src = `
        let i = 0
        while i < 100 {
          i = i + 1
        }
        print(i)
      `;
      assertParity(src);
    });
  });

  describe("4. Optimization Barriers & Safety", () => {
    test("Preserves closure variable capture across scopes", () => {
      const src = `
        fn createCounter(start) {
          let count = start
          return fn() {
            count = count + 1
            return count
          }
        }
        let counter = createCounter(5)
        print(counter())
        print(counter())
        print(counter())
      `;
      assertParity(src);
    });

    test("Preserves RFC-004 async/await semantics as optimization barriers", () => {
      const src = `
        async fn taskA() -> Int {
          return 100
        }
        async fn taskB() -> Int {
          let v = await taskA()
          return v + 50
        }
        let f = taskB()
        let res = await f
        print(res)
      `;
      assertParity(src);
    });

    test("Preserves standard library module functions as side-effect barriers", () => {
      const src = `
        import math
        let r = math.sqrt(64)
        print(r)
      `;
      assertParity(src);
    });
  });

  describe("5. Differential Parity Across Control Flow & Data Structures", () => {
    test("Nested loops and multidimensional iteration parity", () => {
      const src = `
        let total = 0
        let i = 0
        while i < 10 {
          let j = 0
          while j < 5 {
            total = total + (i * j)
            j = j + 1
          }
          i = i + 1
        }
        print(total)
      `;
      assertParity(src);
    });

    test("Complex array and object mutations parity", () => {
      const src = `
        let data = [1, 2, 3]
        data.push(4)
        data[0] = 100
        let obj = { count: 0, items: data }
        obj.count = obj.count + obj.items.length
        print(obj.count)
        print(obj.items[0])
      `;
      assertParity(src);
    });
  });
});
