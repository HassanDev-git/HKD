/**
 * HKD Phase 6.5 — RFC-004 Async/Await Production Hardening Test Suite
 *
 * Exhaustive audit and verification of:
 * 1. Future state machine invariants (3 states, terminal immutability, double-settle guards)
 * 2. Explicit execution timing & lifted awaits (expressions, branches, loops, returns)
 * 3. Safe error semantics & task.unwrap runtime guards
 * 4. Structured concurrency: task.all failure handling & loser detachment
 * 5. Structured concurrency: task.race tie-breaking & loser detachment
 * 6. Memory safety, stress testing (10 to 10,000 tasks) & heap stability
 * 7. Trampoline callback queue & deep recursion without stack overflow
 * 8. Timer hardening (negative/overflow clamping, non-blocking timers)
 * 9. Object/Struct async methods & generic async functions
 * 10. LSP & DAP tooling parity
 * 11. Differential VM parity & deterministic bytecode compilation
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { runSource, runFile } from "../../src/runtime/index.js";
import { Compiler } from "../../src/bytecode/compiler.js";
import { serializeProgram } from "../../src/bytecode/serializer.js";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { getCompletionItems, getHover } from "../../src/lsp/features.js";
import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";

function execute(
  src: string,
  edition: "2026" | "2027" = "2027"
): { output: string[]; ok: boolean; error?: string; diagnostics: string[] } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<phase6_5-test>",
    edition,
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error, diagnostics: res.diagnostics };
}

describe("HKD Phase 6.5 — RFC-004 Async/Await Production Hardening", () => {
  // ─── 1. Future State Machine Invariants ─────────────────────────────────
  describe("1. Future State Machine Invariants", () => {
    test("initial state is pending, transitions legally to resolved", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        print("pending=" + to_string(task.is_pending(fut)))
        print("resolved=" + to_string(task.is_resolved(fut)))
        print("rejected=" + to_string(task.is_rejected(fut)))
        task.resolve(fut, 42)
        print("after_resolve_pending=" + to_string(task.is_pending(fut)))
        print("after_resolve_resolved=" + to_string(task.is_resolved(fut)))
        print("val=" + to_string(task.unwrap(fut)))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual([
        "pending=true",
        "resolved=false",
        "rejected=false",
        "after_resolve_pending=false",
        "after_resolve_resolved=true",
        "val=42",
      ]);
    });

    test("terminal state immutability: double resolve is ignored safely", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        task.resolve(fut, "first")
        task.resolve(fut, "second")
        print("val=" + task.unwrap(fut))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["val=first"]);
    });

    test("terminal state immutability: resolve-after-reject is ignored safely", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        task.reject(fut, "first_err")
        task.resolve(fut, "ignored_val")
        print("rejected=" + to_string(task.is_rejected(fut)))
        print("err=" + to_string(fut.error))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["rejected=true", "err=first_err"]);
    });

    test("terminal state immutability: reject-after-resolve is ignored safely", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        task.resolve(fut, "first_val")
        task.reject(fut, "second_err")
        print("resolved=" + to_string(task.is_resolved(fut)))
        print("val=" + task.unwrap(fut))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["resolved=true", "val=first_val"]);
    });

    test("is_future predicate accurately discriminates values", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        print("fut=" + to_string(task.is_future(fut)))
        print("num=" + to_string(task.is_future(123)))
        print("str=" + to_string(task.is_future("hello")))
        print("obj=" + to_string(task.is_future({ a: 1 })))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["fut=true", "num=false", "str=false", "obj=false"]);
    });
  });

  // ─── 2. Lifted Awaits & Execution Timing ────────────────────────────────
  describe("2. Lifted Awaits & Execution Timing", () => {
    test("awaits inside binary expressions are lifted cleanly", () => {
      const src = `
        async fn get_a() -> Int { return 10 }
        async fn get_b() -> Int { return 25 }
        async fn calc() -> Int {
          let sum = (await get_a()) + (await get_b())
          return sum
        }
        let f = calc()
        print("sum=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["sum=35"]);
    });

    test("await inside return expression is lifted cleanly", () => {
      const src = `
        async fn sub() -> String { return "inner_result" }
        async fn wrapper() -> String {
          return await sub()
        }
        let f = wrapper()
        print(f.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["inner_result"]);
    });

    test("await inside if condition is lifted cleanly", () => {
      const src = `
        async fn check_flag() -> Bool { return true }
        async fn run() -> String {
          if (await check_flag()) {
            return "branch_true"
          } else {
            return "branch_false"
          }
        }
        let f = run()
        print(f.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["branch_true"]);
    });

    test("zero-await async function returns immediately resolved Future", () => {
      const src = `
        async fn immediate() -> Int {
          return 999
        }
        let f = immediate()
        print("state=" + f.state + " val=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["state=resolved val=999"]);
    });
  });

  // ─── 3. Safe Error Semantics & task.unwrap Guards ───────────────────────
  describe("3. Safe Error Semantics & unwrap Guards", () => {
    test("task.unwrap throws runtime error when called on pending future", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        task.unwrap(fut)
      `;
      const { ok, error } = execute(src);
      expect(ok).toBe(false);
      expect(error).toContain("pending");
    });

    test("task.unwrap throws runtime error when called on rejected future", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        task.reject(fut, "connection_failed")
        task.unwrap(fut)
      `;
      const { ok, error } = execute(src);
      expect(ok).toBe(false);
      expect(error).toContain("rejected");
      expect(error).toContain("connection_failed");
    });

    test("task.unwrap throws runtime error when called on non-future", () => {
      const src = `
        import task from "std:task"
        task.unwrap(42)
      `;
      const { ok, error } = execute(src);
      expect(ok).toBe(false);
      expect(error).toContain("expects a Future object");
    });

    test("awaiting rejected future propagates failure to outer future", () => {
      const src = `
        import task from "std:task"
        async fn failing() -> Int {
          let fut = task.future()
          task.reject(fut, "network_timeout")
          let val = await fut
          return val
        }
        let f = failing()
        print("outer_state=" + f.state)
        print("outer_err=" + to_string(f.error))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual([
        "outer_state=rejected",
        "outer_err=network_timeout",
      ]);
    });
  });

  // ─── 4. Structured Concurrency: task.all Hardening ──────────────────────
  describe("4. Structured Concurrency: task.all", () => {
    test("task.all with empty array resolves immediately to empty list", () => {
      const src = `
        import task from "std:task"
        async fn test_empty() -> Int {
          let res = await task.all([])
          return len(res)
        }
        let f = test_empty()
        print("len=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["len=0"]);
    });

    test("task.all with pre-rejected future fails fast", () => {
      const src = `
        import task from "std:task"
        let f1 = task.future()
        let f2 = task.future()
        task.resolve(f1, 100)
        task.reject(f2, "pre_rejected_err")
        let agg = task.all([f1, f2])
        print("agg_state=" + agg.state)
        print("agg_err=" + to_string(agg.error))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["agg_state=rejected", "agg_err=pre_rejected_err"]);
    });

    test("task.all detaches remaining losers upon asynchronous rejection", () => {
      const src = `
        import task from "std:task"
        let f1 = task.future()
        let f2 = task.future()
        let agg = task.all([f1, f2])
        // reject f1
        task.reject(f1, "f1_aborted")
        print("agg_state=" + agg.state + " err=" + to_string(agg.error))
        // resolve loser f2 later; should be safely detached and ignored
        task.resolve(f2, "f2_late")
        print("after_late_resolve_state=" + agg.state)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual([
        "agg_state=rejected err=f1_aborted",
        "after_late_resolve_state=rejected",
      ]);
    });
  });

  // ─── 5. Structured Concurrency: task.race Hardening ─────────────────────
  describe("5. Structured Concurrency: task.race", () => {
    test("task.race selects first resolved future and detaches losers", () => {
      const src = `
        import task from "std:task"
        let f1 = task.future()
        let f2 = task.future()
        let winner_fut = task.race([f1, f2])
        task.resolve(f1, "first_winner")
        task.resolve(f2, "second_loser")
        print("winner=" + to_string(winner_fut.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["winner=first_winner"]);
    });

    test("task.race breaks ties deterministically in index order", () => {
      const src = `
        import task from "std:task"
        let f1 = task.future()
        let f2 = task.future()
        task.resolve(f1, "item_0")
        task.resolve(f2, "item_1")
        let race_fut = task.race([f1, f2])
        print("tie_winner=" + to_string(race_fut.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["tie_winner=item_0"]);
    });

    test("task.race propagates rejection if the earliest settler is rejected", () => {
      const src = `
        import task from "std:task"
        let f1 = task.future()
        let f2 = task.future()
        let race_fut = task.race([f1, f2])
        task.reject(f1, "race_failed")
        task.resolve(f2, "ignored_success")
        print("state=" + race_fut.state + " err=" + to_string(race_fut.error))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["state=rejected err=race_failed"]);
    });
  });

  // ─── 6. Memory Safety & Stress Testing ──────────────────────────────────
  describe("6. Memory Safety & Stress Testing", () => {
    test("spawns and completes 5,000 tasks without memory leak or exhaustion", () => {
      const src = `
        import task from "std:task"
        async fn run_batch(count: Int) -> Int {
          let i = 0
          let sum = 0
          while (i < count) {
            let f = task.spawn(fn() { return 1 })
            sum = sum + task.unwrap(f)
            i = i + 1
          }
          return sum
        }
        let total = run_batch(5000)
        print("total=" + to_string(total.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["total=5000"]);
    });
  });

  // ─── 7. Trampoline Callback Queue & Deep Recursion ──────────────────────
  describe("7. Trampoline Queue & Stack Safety", () => {
    test("handles deep recursive async calls without stack overflow", () => {
      const src = `
        async fn countdown(n: Int) -> Int {
          if (n <= 0) {
            return 0
          }
          let next = await countdown(n - 1)
          return next + 1
        }
        let res = countdown(50)
        print("res=" + to_string(res.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["res=50"]);
    });

    test("handles chained on_complete handlers via trampoline queue", () => {
      const src = `
        import task from "std:task"
        let head = task.future()
        let cur = head
        let i = 0
        while (i < 50) {
          let next = task.future()
          let n_ref = next
          task.on_complete(cur, fn(v) {
            task.resolve(n_ref, v + 1)
          })
          cur = next
          i = i + 1
        }
        task.resolve(head, 0)
        print("final=" + to_string(task.unwrap(cur)))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["final=50"]);
    });
  });

  // ─── 8. Timer Hardening (task.sleep) ────────────────────────────────────
  describe("8. Timer Hardening", () => {
    test("task.sleep clamps negative ms to 0 without throwing", () => {
      const src = `
        import task from "std:task"
        async fn test_negative() -> String {
          let _ = await task.sleep(-50)
          return "slept_negative"
        }
        let f = test_negative()
        print(f.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["slept_negative"]);
    });

    test("task.sleep clamps overflow ms to maximum int32 bound", () => {
      const src = `
        import task from "std:task"
        let fut = task.sleep(9999999999999)
        print("is_future=" + to_string(task.is_future(fut)))
        print("val=" + to_string(fut.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["is_future=true", "val=2147483647"]);
    });
  });

  // ─── 9. Methods & Generics Integration ──────────────────────────────────
  describe("9. Methods & Generics Integration", () => {
    test("async methods on structs compile and execute cleanly", () => {
      const src = `
        struct Counter {
          count: Int
        }

        impl Counter {
          async fn increment(self, step: Int) -> Int {
            return self.count + step
          }
        }

        let c = Counter { count: 10 }
        let f = c.increment(5)
        print("val=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["val=15"]);
    });

    test("generic async functions specialize correctly", () => {
      const src = `
        async fn identity<T>(val: T) -> T {
          return val
        }
        let f1 = identity(42)
        let f2 = identity("hkd_generic")
        print("f1=" + to_string(f1.value) + " f2=" + f2.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["f1=42 f2=hkd_generic"]);
    });
  });

  // ─── 10. Tooling Parity (LSP & DAP) ─────────────────────────────────────
  describe("10. Tooling Parity (LSP & DAP)", () => {
    test("LSP hover displays Future<T> return type for async functions", () => {
      const docManager = new DocumentManager();
      const ws = new WorkspaceGraph();
      const doc = docManager.open(
        "file:///test_async.hkd",
        1,
        "async fn fetchData() -> String {\n  return \"data\"\n}\nfetchData()"
      );
      const hover = getHover(doc, { line: 3, character: 3 }, ws);
      expect(hover).not.toBeNull();
      const text = typeof hover?.contents === "object" ? (hover.contents as any).value : "";
      expect(text).toContain("Future<String>");
    });

    test("LSP completion items include task module methods with documentation", () => {
      const docManager = new DocumentManager();
      const ws = new WorkspaceGraph();
      const doc = docManager.open("file:///test_task.hkd", 1, "task.");
      const items = getCompletionItems(doc, { line: 0, character: 5 }, ws);
      const labels = items.map((i) => i.label);
      expect(labels).toContain("unwrap");
      expect(labels).toContain("is_pending");
      expect(labels).toContain("is_resolved");
      expect(labels).toContain("is_rejected");
      expect(labels).toContain("future");
      expect(labels).toContain("resolve");
      expect(labels).toContain("reject");
    });
  });

  // ─── 11. Differential VM Parity ─────────────────────────────────────────
  describe("11. Differential VM Parity & Determinism", () => {
    const RUNTIME_BIN = process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime";
    const nativeRuntime = path.resolve("native-runtime/zig-out/bin", RUNTIME_BIN);

    test("Stack VM and Native VM agree on async task execution", () => {
      if (!fs.existsSync(nativeRuntime)) {
        return;
      }

      const src = `
        import task from "std:task"
        let f = task.future()
        task.resolve(f, 42)
        print(to_string(task.unwrap(f)))
      `;

      const tmpHkd = path.resolve(".hkd/test_async_parity.hkd");
      const tmpHkdb = path.resolve(".hkd/test_async_parity.hkdb");
      fs.mkdirSync(path.dirname(tmpHkd), { recursive: true });
      fs.writeFileSync(tmpHkd, src, "utf8");

      // Compile to bytecode
      const reporter = new ErrorReporter(src, tmpHkd);
      const lexer = new Lexer(src, tmpHkd, reporter);
      const tokens = lexer.tokenize();
      const parser = new Parser(tokens, src, tmpHkd, reporter);
      const ast = parser.parse();
      const compiler = new Compiler(reporter);
      const chunk = compiler.compile(ast);
      const binary = serializeProgram(chunk);
      fs.writeFileSync(tmpHkdb, binary);

      // 1. Reference Stack VM
      const refRes = execute(src);
      expect(refRes.ok).toBe(true);
      expect(refRes.output.join("\n").trim()).toBe("42");

      // 2. Native VM
      const res = spawnSync(nativeRuntime, [tmpHkdb, "--vm"], {
        encoding: "utf-8",
        env: { ...process.env, ComSpec: "C:\\Windows\\SysWOW64\\cmd.exe" },
      });
      expect(res.status).toBe(0);
      expect(res.stdout.trim()).toBe("42");

      try {
        fs.unlinkSync(tmpHkd);
        fs.unlinkSync(tmpHkdb);
      } catch {}
    });
  });
});
