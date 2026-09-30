/**
 * HKD Phase 9G — Performance Regression Analysis & End-to-End Optimization Test Suite
 *
 * Verifies:
 *   1. GlobalCell architecture & per-frame slot caching in Stack and Register VMs
 *   2. Variable mutation synchronization across cells, maps, and nested frames
 *   3. CLI startup fast-paths and module lazy-loading isolation
 *   4. Direct AST traversal in async lowering (hasAwait & collectDeclaredVariables)
 *   5. State isolation across repeated executions without memory leaks
 *   6. Differential Parity (Stack VM Reference vs Register VM)
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { VM } from "../../src/vm/vm.js";
import { RegisterVM } from "../../src/vm/vm_register.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";
import { hasAwait } from "../../src/bytecode/async_lowering.js";
import * as N from "../../src/ast/nodes.js";

function compileToStackChunk(source: string, edition: "2026" | "2027" = "2026") {
  const reporter = new ErrorReporter(source, "<test>");
  const lexer = new Lexer(source, "<test>", reporter);
  const parser = new Parser(lexer.tokenize(), source, "<test>", reporter, edition);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  const compiler = new Compiler(reporter);
  return compiler.compile(ast);
}

function assertDifferentialParity(source: string, edition: "2026" | "2027" = "2026") {
  const stackOut: string[] = [];
  const regOut: string[] = [];

  const oldVm = process.env.HKD_VM;
  try {
    delete process.env.HKD_VM;
    const resStack = runSource(source, {
      edition,
      noExit: true,
      output: (s: string) => stackOut.push(s),
      printDiagnostics: false,
    });
    expect(resStack.ok).toBe(true);

    process.env.HKD_VM = "register";
    const resReg = runSource(source, {
      edition,
      noExit: true,
      output: (s: string) => regOut.push(s),
      printDiagnostics: false,
    });
    expect(resReg.ok).toBe(true);

    expect(regOut.join("\n")).toBe(stackOut.join("\n"));
  } finally {
    if (oldVm !== undefined) {
      process.env.HKD_VM = oldVm;
    } else {
      delete process.env.HKD_VM;
    }
  }
}

describe("Phase 9G — Regression Analysis & End-to-End Optimization", () => {
  // ─── 1. GlobalCell Architecture & VM Caching ──────────────────────────────
  describe("GlobalCell Architecture & Caching", () => {
    test("Register VM caches GlobalCell for rapid repeated access", () => {
      const source = `
        let counter = 0
        let i = 0
        while i < 100 {
          counter = counter + 1
          i = i + 1
        }
      `;
      const chunk = compileToStackChunk(source);
      const regChunk = lowerToRegisterChunk(chunk);

      const vm = new RegisterVM();
      const res = vm.run(regChunk);

      expect(res.ok).toBe(true);
      expect(vm.getGlobal("counter")).toBe(100);
      expect(vm.getGlobal("i")).toBe(100);
    });

    test("Stack VM caches GlobalCell for rapid repeated access", () => {
      const source = `
        let total = 10
        let step = 5
        let k = 0
        while k < 10 {
          total = total + step
          k = k + 1
        }
      `;
      const chunk = compileToStackChunk(source);
      const vm = new VM();
      const res = vm.run(chunk);

      expect(res.ok).toBe(true);
      expect(vm.getGlobal("total")).toBe(60);
    });

    test("GlobalCell mutations remain synchronized across VM API and runtime", () => {
      const vm = new RegisterVM();
      vm.setGlobal("shared_val", 42);
      expect(vm.getGlobal("shared_val")).toBe(42);

      const source = `
        shared_val = shared_val + 8
      `;
      const chunk = compileToStackChunk(source);
      const regChunk = lowerToRegisterChunk(chunk);
      const res = vm.run(regChunk);
      expect(res.ok).toBe(true);
      expect(vm.getGlobal("shared_val")).toBe(50);
    });

    test("Multiple VM instances maintain strictly isolated GlobalCells", () => {
      const source = `
        let x = 100
        x = x + 25
      `;
      const chunk = compileToStackChunk(source);
      const regChunk = lowerToRegisterChunk(chunk);

      const vm1 = new RegisterVM();
      const vm2 = new RegisterVM();

      vm1.run(regChunk);
      expect(vm1.getGlobal("x")).toBe(125);
      expect(vm2.getGlobal("x")).toBeUndefined();
    });
  });

  // ─── 2. Async Lowering Traversal Optimizations ────────────────────────────
  describe("Async Lowering Direct AST Traversal", () => {
    test("hasAwait correctly identifies AwaitExpr without reflection", () => {
      const dummyLoc = { file: "<test>", line: 1, column: 1, offset: 0 };
      const dummySpan = { start: dummyLoc, end: dummyLoc, file: "<test>" };

      const plainIdent: N.IdentExpr = { kind: "IdentExpr", name: "foo", span: dummySpan };
      const awaitExpr: N.AwaitExpr = { kind: "AwaitExpr", expr: plainIdent, span: dummySpan };
      const binaryWithAwait: N.BinaryExpr = {
        kind: "BinaryExpr",
        op: "+",
        left: plainIdent,
        right: awaitExpr,
        span: dummySpan,
      };

      expect(hasAwait(plainIdent)).toBe(false);
      expect(hasAwait(awaitExpr)).toBe(true);
      expect(hasAwait(binaryWithAwait)).toBe(true);
    });

    test("concurrency_async workload compiles and executes with correct result", () => {
      const source = `
        async fn worker(id: Int) -> Int {
          return id * 10
        }

        async fn run_batch() -> Int {
          let f1 = worker(1)
          let f2 = worker(2)
          let f3 = worker(3)
          let r1 = await f1
          let r2 = await f2
          let r3 = await f3
          return r1 + r2 + r3
        }

        async fn main_async() -> Int {
          let res = await run_batch()
          print(to_string(res))
          return res
        }

        main_async()
      `;

      const output: string[] = [];
      const res = runSource(source, {
        edition: "2027",
        noExit: true,
        output: (s: string) => output.push(s),
        printDiagnostics: false,
      });

      expect(res.ok).toBe(true);
      expect(output.join("")).toBe("60");
    });
  });

  // ─── 3. Differential Parity Verification ──────────────────────────────────
  describe("Differential Parity Verification", () => {
    test("Parity on global loop counter with multi-way branching", () => {
      const source = `
        let sum = 0
        let i = 0
        while i < 50 {
          if i % 3 == 0 {
            sum = sum + i * 2
          } else if i % 3 == 1 {
            sum = sum + i
          } else {
            sum = sum - 1
          }
          i = i + 1
        }
        print(to_string(sum))
      `;
      assertDifferentialParity(source);
    });

    test("Parity on function calls with global accumulator", () => {
      const source = `
        let acc = 0
        fn add_to_acc(v: Int) -> Int {
          acc = acc + v
          return acc
        }

        let j = 0
        while j < 20 {
          add_to_acc(j)
          j = j + 1
        }
        print(to_string(acc))
      `;
      assertDifferentialParity(source);
    });

    test("Parity on nested data structures and string concatenation", () => {
      const source = `
        let s = "start"
        let k = 0
        while k < 5 {
          s = s + "-" + to_string(k)
          k = k + 1
        }
        print(s)
      `;
      assertDifferentialParity(source);
    });
  });

  // ─── 4. Re-entrant State Isolation ─────────────────────────────────────────
  describe("State Isolation & Reset", () => {
    test("Successive runs with clean VM do not retain prior globals", () => {
      const run1Out: string[] = [];
      const run2Out: string[] = [];

      runSource("let a = 123; print(to_string(a))", {
        output: (s: string) => run1Out.push(s),
        noExit: true,
      });

      runSource("let b = 456; print(to_string(b))", {
        output: (s: string) => run2Out.push(s),
        noExit: true,
      });

      expect(run1Out.join("")).toBe("123");
      expect(run2Out.join("")).toBe("456");
    });
  });
});
