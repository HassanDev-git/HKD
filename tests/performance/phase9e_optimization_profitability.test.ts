/**
 * HKD Phase 9E — Optimization Profitability & Register Pipeline Refinement Test Suite
 *
 * Verifies:
 *   1. Profitability Assessment & Tiered Execution
 *   2. Small Program Fast Path
 *   3. Advanced Register Cleanup (Source Forwarding, Chained Moves, Dead Jumps)
 *   4. Optimization Barriers & Safety (Closures, Async, Native calls, Mutations)
 *   5. Recursive Function Optimization & Call Safety
 *   6. Differential Parity (Stack VM Reference vs Register VM vs Optimized Register VM)
 */

import { describe, test, expect } from "@jest/globals";
import { runSource } from "../../src/runtime/index.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { lowerToRegisterChunk } from "../../src/bytecode/register_lowering.js";
import { OptimizerPipeline } from "../../src/compiler/optimizer.js";
import {
  analyzeAstProfitability,
  computeProfitabilityDecision,
  OptimizationTier,
} from "../../src/compiler/profitability.js";
import { RegOp } from "../../src/bytecode/register_chunk.js";

function parseProgram(source: string, edition: "2026" | "2027" = "2026") {
  const reporter = new ErrorReporter(source, "<test>");
  const lexer = new Lexer(source, "<test>", reporter);
  const parser = new Parser(lexer.tokenize(), source, "<test>", reporter, edition);
  const ast = parser.parse();
  const analyser = new SemanticAnalyser(reporter, source);
  analyser.analyse(ast);
  return ast;
}

function compileToReg(source: string, edition: "2026" | "2027" = "2026") {
  const ast = parseProgram(source, edition);
  const reporter = new ErrorReporter(source, "<test>");
  const compiler = new Compiler(reporter);
  const chunk = compiler.compile(ast);
  return lowerToRegisterChunk(chunk);
}

function assertDifferentialParity(source: string, edition: "2026" | "2027" = "2026") {
  const stackOutput: string[] = [];
  const regOutput: string[] = [];

  const stackRes = runSource(source, {
    edition,
    vm: "stack",
    output: (s) => stackOutput.push(s),
    printDiagnostics: false,
  });

  const regRes = runSource(source, {
    edition,
    vm: "register",
    output: (s) => regOutput.push(s),
    printDiagnostics: false,
  });

  expect(regRes.ok).toBe(stackRes.ok);
  expect(regOutput).toEqual(stackOutput);
  if (stackRes.ok) {
    expect(regRes.value).toEqual(stackRes.value);
  }
}

describe("Phase 9E: Optimization Profitability & Register Pipeline Suite", () => {
  describe("1. Profitability Model & Small Program Fast Path", () => {
    test("Identifies tiny programs and activates Small Program Fast Path", () => {
      const ast = parseProgram("let a = 1\nlet b = 2\nprint(a + b)");
      const metrics = analyzeAstProfitability(ast);
      const decision = computeProfitabilityDecision(metrics);

      expect(decision.isSmallProgram).toBe(true);
      expect(decision.enableAstPass).toBe(false); // AST deep cloning bypassed
      expect(decision.enableRegisterOpt).toBe(true); // Cheap register cleanup active
    });

    test("Activates full optimization for programs with loops or foldable expressions", () => {
      const ast = parseProgram("let i = 0\nwhile i < 100 { i = i + 1 }\nprint(i)");
      const metrics = analyzeAstProfitability(ast);
      const decision = computeProfitabilityDecision(metrics);

      expect(decision.isSmallProgram).toBe(false);
      expect(decision.allowedTier).toBe(OptimizationTier.Tier2_Expensive);
      expect(decision.enableAstPass).toBe(true);
      expect(decision.enableDce).toBe(true);
    });

    test("Honors explicit optimization tier overrides", () => {
      const ast = parseProgram("let x = 100 * 20");
      const metrics = analyzeAstProfitability(ast);
      const decision = computeProfitabilityDecision(metrics, OptimizationTier.Tier0_AlwaysCheap);

      expect(decision.allowedTier).toBe(OptimizationTier.Tier0_AlwaysCheap);
      expect(decision.enableAstPass).toBe(false);
    });
  });

  describe("2. Advanced Register Pipeline Refinements", () => {
    test("Eliminates local-to-temporary moves via Source Forwarding", () => {
      const src = `
        fn compute(x: Int, y: Int) -> Int {
          let a = x * 2
          let b = a + y
          return b
        }
      `;
      const regChunk = compileToReg(src);
      const fn = regChunk.constants.find((c: any) => c && c.type === "function" && c.name === "compute") as any;
      expect(fn).toBeDefined();

      const ops = fn.registerChunk.code.map((ins: any) => ins.op);
      // No redundant Move instructions inside the straight-line compute body
      const moveCount = ops.filter((op: any) => op === RegOp.Move).length;
      expect(moveCount).toBe(0);
    });

    test("Forward-optimizes recursive function call preparation and return", () => {
      const src = `
        fn fib(n: Int) -> Int {
          if n <= 1 { return n }
          return fib(n - 1) + fib(n - 2)
        }
      `;
      const regChunk = compileToReg(src);
      const fn = regChunk.constants.find((c: any) => c && c.type === "function" && c.name === "fib") as any;
      expect(fn).toBeDefined();

      // Return directly returns arg 0 without local-to-temp move
      const returns = fn.registerChunk.code.filter((ins: any) => ins.op === RegOp.Return);
      expect(returns[0].dst).toBe(0);

      // Dead jump to immediately following instruction is removed
      const jumps = fn.registerChunk.code.filter((ins: any) => ins.op === RegOp.Jump);
      for (let i = 0; i < fn.registerChunk.code.length; i++) {
        const ins = fn.registerChunk.code[i];
        if (ins.op === RegOp.Jump) {
          expect(ins.dst).not.toBe(i + 1);
        }
      }
    });

    test("Eliminates self-moves and redundant chained moves", () => {
      const pipeline = new OptimizerPipeline();
      const mockRegChunk = {
        name: "test",
        arity: 0,
        registerCount: 70,
        constants: [],
        code: [
          { op: RegOp.Move, dst: 64, src1: 64, src2: 0, line: 1 }, // self-move
          { op: RegOp.Move, dst: 65, src1: 1, src2: 0, line: 2 },
          { op: RegOp.Move, dst: 66, src1: 65, src2: 0, line: 3 },  // chained move
          { op: RegOp.Return, dst: 66, src1: 0, src2: 0, line: 4 },
        ],
      } as any;

      const opt = pipeline.optimizeRegister(mockRegChunk);
      // Self-move eliminated, chained move forwarded, return uses src directly
      expect(opt.code.length).toBeLessThan(4);
    });
  });

  describe("3. Optimization Barriers & Safety Conformance", () => {
    test("Preserves variable mutations in loops and conditional updates", () => {
      const src = `
        let sum = 0
        let i = 1
        while i <= 10 {
          sum = sum + i
          i = i + 1
        }
        print(sum)
      `;
      assertDifferentialParity(src);
    });

    test("Preserves closure environment binding across function invocations", () => {
      const src = `
        fn makeAdder(base: Int) -> fn(Int) -> Int {
          return fn(x: Int) -> Int { return base + x }
        }
        let add10 = makeAdder(10)
        let add25 = makeAdder(25)
        print(add10(5))
        print(add25(5))
      `;
      assertDifferentialParity(src);
    });

    test("Preserves RFC-004 async function suspension barriers", () => {
      const src = `
        #feature(async)
        async fn task(n: Int) -> Int {
          return n * 10
        }
        let f = task(5)
        print(f.isCompleted)
      `;
      assertDifferentialParity(src, "2027");
    });

    test("Preserves runtime division by zero exception barrier", () => {
      const src = `
        let zero = 0
        let err = 100 / zero
        print(err)
      `;
      const stackRes = runSource(src, { vm: "stack", printDiagnostics: false });
      const regRes = runSource(src, { vm: "register", printDiagnostics: false });

      expect(stackRes.ok).toBe(false);
      expect(regRes.ok).toBe(false);
      expect(regRes.error).toContain("Division by zero");
    });
  });

  describe("4. Complex Data Structure & Control Flow Parity", () => {
    test("Nested multi-dimensional loops with array accumulation", () => {
      const src = `
        let matrix = []
        let i = 0
        while i < 3 {
          let row = []
          let j = 0
          while j < 3 {
            row.push(i * 10 + j)
            j = j + 1
          }
          matrix.push(row)
          i = i + 1
        }
        print(matrix[0][0])
        print(matrix[1][1])
        print(matrix[2][2])
      `;
      assertDifferentialParity(src);
    });

    test("Object struct mutation and field queries", () => {
      const src = `
        let user = { name: "hkd", visits: 1, active: true }
        user.visits = user.visits + 5
        user.active = false
        print(user.name)
        print(user.visits)
        print(user.active)
      `;
      assertDifferentialParity(src);
    });

    test("String concatenation and length operations", () => {
      const src = `
        let s = "hello"
        let count = 0
        while count < 20 {
          s = s + "!"
          count = count + 1
        }
        print(s.length)
      `;
      assertDifferentialParity(src);
    });
  });
});
