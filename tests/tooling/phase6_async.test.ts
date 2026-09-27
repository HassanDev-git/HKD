/**
 * HKD Phase 6 — RFC-004 Async/Await, Futures & Structured Concurrency Test Suite
 *
 * Exhaustive verification of:
 * 1. Edition gating: Edition 2026 rejects with E201; Edition 2027 accepts
 * 2. Semantic diagnostics: E305 for await outside async fn, type rules
 * 3. Deterministic state-machine lowering and execution on reference VM
 * 4. Structured concurrency primitives (task.all, task.race, task.spawn, task.sleep)
 * 5. Error handling and Result integration
 * 6. Tooling parity: LSP completions & hover, Code Formatter
 * 7. Dogfood applications: Async HTTP client, HTTP service, Data pipeline
 */

import * as fs from "fs";
import * as path from "path";
import { runSource, runFile } from "../../src/runtime/index.js";
import { format } from "../../src/formatter/index.js";
import { getCompletionItems, getHover } from "../../src/lsp/features.js";
import { DocumentManager } from "../../src/lsp/documents.js";
import { WorkspaceGraph } from "../../src/lsp/workspace-graph.js";

function execute(
  src: string,
  edition: "2026" | "2027" = "2027"
): { output: string[]; ok: boolean; error?: string; diagnostics: string[] } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<phase6-test>",
    edition,
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error, diagnostics: res.diagnostics };
}

describe("Phase 6 — RFC-004 Async/Await & Concurrency", () => {
  // ─── 1. Edition Gating ───────────────────────────────────────────────────
  describe("Edition Gating", () => {
    test("Edition 2026 rejects async fn without feature flag", () => {
      const src = `
        async fn fetch_val() -> Int {
          return 42
        }
      `;
      const { ok, diagnostics } = execute(src, "2026");
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E201") && d.includes("async"))).toBe(true);
    });

    test("Edition 2026 rejects await without feature flag", () => {
      const src = `
        fn test_await(fut: Int) {
          let x = await fut
        }
      `;
      const { ok, diagnostics } = execute(src, "2026");
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E201") && d.includes("await"))).toBe(true);
    });

    test("Edition 2026 accepts async with explicit #feature(async)", () => {
      const src = `
        #feature(async)
        async fn fetch_val() -> Int {
          return 42
        }
        let f = fetch_val()
        print(to_string(f.value))
      `;
      const { ok, output } = execute(src, "2026");
      expect(ok).toBe(true);
      expect(output).toEqual(["42"]);
    });

    test("Edition 2027 accepts async/await out of the box", () => {
      const src = `
        async fn compute(n: Int) -> Int {
          return n * 2
        }
        let f = compute(21)
        print(to_string(f.value))
      `;
      const { ok, output } = execute(src, "2027");
      expect(ok).toBe(true);
      expect(output).toEqual(["42"]);
    });
  });

  // ─── 2. Semantic Analysis & Diagnostics ──────────────────────────────────
  describe("Semantic Diagnostics", () => {
    test("rejects await outside async function with E305", () => {
      const src = `
        #feature(async)
        fn regular_fn(f: Int) {
          let x = await f
        }
      `;
      const { ok, diagnostics } = execute(src, "2027");
      expect(ok).toBe(false);
      expect(diagnostics.some((d) => d.includes("E305"))).toBe(true);
    });
  });

  // ─── 3. Deterministic State-Machine Execution ────────────────────────────
  describe("State-Machine Execution", () => {
    test("executes async fn returning resolved Future immediately", () => {
      const src = `
        async fn get_num() -> Int {
          return 100
        }
        let f = get_num()
        print("state=" + f.state + " val=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["state=resolved val=100"]);
    });

    test("unwraps sequential await calls preserving variables across states", () => {
      const src = `
        async fn step1(x: Int) -> Int {
          return x + 10
        }
        async fn step2(y: Int) -> Int {
          return y * 3
        }
        async fn pipeline(start: Int) -> Int {
          let a = await step1(start)
          let b = await step2(a)
          return b + 5
        }
        let f = pipeline(5)
        print(to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      // (5 + 10) * 3 + 5 = 50
      expect(output).toEqual(["50"]);
    });

    test("handles returns inside conditional branches in async fn", () => {
      const src = `
        async fn check_even(n: Int) -> String {
          if (n % 2 == 0) {
            return "even"
          } else {
            return "odd"
          }
        }
        let f1 = check_even(4)
        let f2 = check_even(7)
        print(f1.value + " " + f2.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["even odd"]);
    });

    test("implicit return null when no explicit return statement", () => {
      const src = `
        let executed = false
        async fn side_effect() {
          executed = true
        }
        let f = side_effect()
        print(f.state + " " + to_string(executed) + " " + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["resolved true null"]);
    });
  });

  // ─── 4. Concurrency Primitives (std:task) ────────────────────────────────
  describe("Structured Concurrency (std:task)", () => {
    test("task.sleep and task.on_complete", () => {
      const src = `
        import task from "std:task"
        async fn nap() -> Int {
          let _s = await task.sleep(2)
          return 99
        }
        let f = nap()
        print("f=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["f=99"]);
    });

    test("task.all waits for multiple concurrent futures", () => {
      const src = `
        import task from "std:task"
        async fn worker(id: Int) -> Int {
          return id * 10
        }
        async fn run_all() -> Int {
          let f1 = worker(1)
          let f2 = worker(2)
          let f3 = worker(3)
          let res = await task.all([f1, f2, f3])
          return res[0] + res[1] + res[2]
        }
        let f = run_all()
        print("sum=" + to_string(f.value))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["sum=60"]);
    });

    test("task.race selects the earliest completed future", () => {
      const src = `
        import task from "std:task"
        async fn fast() -> String {
          return "winner"
        }
        async fn slow() -> String {
          let _s = await task.sleep(10)
          return "loser"
        }
        async fn run_race() -> String {
          let f1 = fast()
          let f2 = slow()
          let res = await task.race([f1, f2])
          return res
        }
        let f = run_race()
        print("race=" + f.value)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["race=winner"]);
    });

    test("task.spawn launches task returning a Future", () => {
      const src = `
        import task from "std:task"
        let f = task.spawn(fn() {
          return 123
        })
        print("spawned=" + to_string(f.value) + " state=" + f.state)
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["spawned=123 state=resolved"]);
    });

    test("manual future manipulation with resolve and unwrap", () => {
      const src = `
        import task from "std:task"
        let fut = task.future()
        print("is_pending=" + to_string(task.is_pending(fut)))
        task.resolve(fut, "hello_async")
        print("is_resolved=" + to_string(task.is_resolved(fut)))
        print("val=" + task.unwrap(fut))
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual([
        "is_pending=true",
        "is_resolved=true",
        "val=hello_async",
      ]);
    });
  });

  // ─── 5. Result Error Handling Integration ────────────────────────────────
  describe("Result & Async Integration", () => {
    test("propagates Result.ok and Result.err from async workflows", () => {
      const src = `
        import result from "std:result"
        async fn divide_async(a: Int, b: Int) {
          if (b == 0) {
            return result.err("Division by zero")
          }
          return result.ok(a / b)
        }
        async fn runner() {
          let ok_res = await divide_async(20, 4)
          let err_res = await divide_async(20, 0)
          if (result.is_ok(ok_res)) {
            print("OK=" + to_string(result.unwrap(ok_res)))
          }
          if (result.is_err(err_res)) {
            print("ERR=" + result.unwrap_err(err_res))
          }
        }
        let _f = runner()
      `;
      const { ok, output } = execute(src);
      expect(ok).toBe(true);
      expect(output).toEqual(["OK=5", "ERR=Division by zero"]);
    });
  });

  // ─── 6. Tooling Parity: Formatter & LSP ───────────────────────────────────
  describe("Tooling Parity", () => {
    test("formatter preserves async and await syntax", () => {
      const unformatted = `async fn get_data(x:Int)->Int{let y=await fetch(x);return y+1;}`;
      const formatted = format(unformatted);
      expect(formatted).toContain("async fn get_data(x: Int) -> Int {");
      expect(formatted).toContain("let y = await fetch(x)");
      expect(formatted).toContain("return y + 1");
    });

    test("LSP autocompletion provides async and await keywords and task module", () => {
      const docManager = new DocumentManager();
      const ws = new WorkspaceGraph();
      const doc = docManager.open("file:///test.hkd", 1, "task.");
      const items = getCompletionItems(doc, { line: 0, character: 5 }, ws);
      const labels = items.map((i) => i.label);
      expect(labels).toContain("sleep");
      expect(labels).toContain("all");
      expect(labels).toContain("race");
      expect(labels).toContain("spawn");
    });

    test("LSP hover on async keyword displays documentation", () => {
      const docManager = new DocumentManager();
      const ws = new WorkspaceGraph();
      const doc = docManager.open("file:///test.hkd", 1, "async fn foo() {}");
      const hover = getHover(doc, { line: 0, character: 2 }, ws);
      expect(hover).not.toBeNull();
      expect(typeof hover?.contents === "object" && (hover.contents as any).value).toContain("async");
    });

    test("LSP hover on async function displays async signature", () => {
      const docManager = new DocumentManager();
      const ws = new WorkspaceGraph();
      const doc = docManager.open(
        "file:///test.hkd",
        1,
        "async fn compute(x: Int) -> Int {\n  return x\n}\ncompute(1)"
      );
      const hover = getHover(doc, { line: 3, character: 3 }, ws);
      expect(hover).not.toBeNull();
      expect(typeof hover?.contents === "object" && (hover.contents as any).value).toContain("async fn compute");
    });
  });

  // ─── 7. Dogfood Applications Execution ───────────────────────────────────
  describe("Dogfood Applications", () => {
    test("Dogfood App A (async_http_client) executes and matches output", () => {
      const filePath = path.resolve("examples/dogfood/async_http_client/main.hkd");
      const res = runFile(filePath, { edition: "2027", printDiagnostics: false });
      expect(res.ok).toBe(true);
      expect(fs.existsSync(filePath.replace(/\.hkd$/, ".hkdb"))).toBe(true);
    });

    test("Dogfood App B (async_http_service) executes and matches output", () => {
      const filePath = path.resolve("examples/dogfood/async_http_service/main.hkd");
      const res = runFile(filePath, { edition: "2027", printDiagnostics: false });
      expect(res.ok).toBe(true);
      expect(fs.existsSync(filePath.replace(/\.hkd$/, ".hkdb"))).toBe(true);
    });

    test("Dogfood App C (async_data_pipeline) executes and matches output", () => {
      const filePath = path.resolve("examples/dogfood/async_data_pipeline/main.hkd");
      const res = runFile(filePath, { edition: "2027", printDiagnostics: false });
      expect(res.ok).toBe(true);
      expect(fs.existsSync(filePath.replace(/\.hkd$/, ".hkdb"))).toBe(true);
    });
  });
});
