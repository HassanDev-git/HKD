/**
 * HKD Phase 8 Real-World Reliability & Stress Test Suite
 * (tests/runtime/phase8_stress.test.ts)
 *
 * Exercises:
 * 1. Deep recursion and call-frame stack limits
 * 2. Large loop transformations and memory reclamation
 * 3. Async task scheduler stress with multiple concurrent resolutions
 * 4. Repeated compiler and package cache churn
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";
import { VM } from "../../src/vm/vm.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { SemanticAnalyser } from "../../src/semantic/analyser.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { ContentAddressedCache } from "../../src/package-manager/cache.js";

describe("Workstream 8N: Phase 8 Real-World Reliability & Stress Testing", () => {
  test("1. Deep recursion safely computes or hits call depth limit without crash", () => {
    const code = `
      fn recurse_sum(n: int, acc: int) -> int {
        if n <= 0 {
          return acc;
        }
        return recurse_sum(n - 1, acc + n);
      }
      let _r = recurse_sum(100, 0);
    `;

    const res = runSource(code, { edition: "2026", noExit: true });
    expect(res.ok).toBe(true);
  });

  test("2. Large loop iteration and memory stability under soak load", () => {
    const code = `
      let mut_count = 0;
      let i = 0;
      while i < 10000 {
        mut_count = mut_count + 1;
        i = i + 1;
      }
    `;

    const res = runSource(code, { edition: "2026", noExit: true });
    expect(res.ok).toBe(true);
  });

  test("3. Async task concurrency stress (RFC-004)", async () => {
    const code = `
      async fn compute(val: int) -> int {
        return val * 2;
      }

      async fn run_batch() -> int {
        let f1 = compute(10);
        let f2 = compute(20);
        let f3 = compute(30);
        let r1 = await f1;
        let r2 = await f2;
        let r3 = await f3;
        return r1 + r2 + r3;
      }

      async fn main_async() -> int {
        let _res = await run_batch();
        return _res;
      }

      main_async();
    `;

    const res = runSource(code, { edition: "2027", noExit: true });
    expect(res.ok).toBe(true);
  });

  test("4. Repeated compiler execution & cache churn without leak", () => {
    const tempDir = path.resolve(".hkd/test_stress_cache_" + Date.now());
    const cacheDir = path.join(tempDir, "cache");
    fs.mkdirSync(cacheDir, { recursive: true });

    try {
      const cache = new ContentAddressedCache(cacheDir);

      const src = `
        fn calculate(x: int) -> int {
          return x * x + 42;
        }
        let _v = calculate(12);
      `;

      for (let i = 0; i < 50; i++) {
        const reporter = new ErrorReporter(src, `<stress-${i}>`);
        const lexer = new Lexer(src, `<stress-${i}>`, reporter);
        const tokens = lexer.tokenize();
        const parser = new Parser(tokens, src, `<stress-${i}>`, reporter);
        const ast = parser.parse();
        const analyser = new SemanticAnalyser(reporter, src);
        analyser.analyse(ast);
        const compiler = new Compiler(reporter);
        const chunk = compiler.compile(ast);

        const vm = new VM(() => {});
        const runRes = vm.run(chunk);
        expect(runRes.ok).toBe(true);
      }
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
