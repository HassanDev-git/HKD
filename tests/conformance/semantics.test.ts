/**
 * HKD 1.0 Conformance Suite: Operational Semantics (tests/conformance/semantics.test.ts)
 *
 * Validates execution semantics, variable scoping, shadowing, evaluation order,
 * short-circuit evaluation, and closure environments as specified in docs/semantics.md.
 */

import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-semantics>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("HKD 1.0 Language Conformance — Operational Semantics", () => {
  test("C-SEM-01: Block Scope Isolation (inner variables do not leak)", () => {
    const src = `
      let x = 10
      if true {
        let y = 20
        print(x + y)
      }
      print(x)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["30", "10"]);
  });

  test("C-SEM-02: Variable Shadowing in Nested Blocks", () => {
    const src = `
      let a = "outer"
      if true {
        let a = "inner"
        print(a)
      }
      print(a)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["inner", "outer"]);
  });

  test("C-SEM-03: Variable Reassignment in Same Scope", () => {
    const src = `
      let counter = 0
      counter = 1
      counter = counter + 5
      print(counter)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["6"]);
  });

  test("C-SEM-04: Left-to-Right Evaluation Order in Binary Operations", () => {
    const src = `
      import array
      let tracker = []
      fn record(v) {
        array.push(tracker, v)
        return v
      }
      let result = record(1) + record(2) * record(3)
      print(result)
      print(tracker[0])
      print(tracker[1])
      print(tracker[2])
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["7", "1", "2", "3"]);
  });

  test("C-SEM-05: Logical AND Short-Circuit Semantics", () => {
    const src = `
      let sideEffect = false
      fn trigger() {
        sideEffect = true
        return true
      }
      let res = false && trigger()
      print(res)
      print(sideEffect)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["false", "false"]);
  });

  test("C-SEM-06: Logical OR Short-Circuit Semantics", () => {
    const src = `
      let sideEffect = false
      fn trigger() {
        sideEffect = true
        return true
      }
      let res = true || trigger()
      print(res)
      print(sideEffect)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "false"]);
  });

  test("C-SEM-07: Closures Capturing Outer Environment", () => {
    const src = `
      fn makeAdder(base) {
        fn add(x) {
          return base + x
        }
        return add
      }
      let add10 = makeAdder(10)
      let add20 = makeAdder(20)
      print(add10(5))
      print(add20(5))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["15", "25"]);
  });

  test("C-SEM-08: Implicit Return Value is Null", () => {
    const src = `
      fn noReturn() {
        let a = 123
      }
      let result = noReturn()
      print(result == null)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true"]);
  });

  test("C-SEM-09: Recursive Function Scoping and Base Case", () => {
    const src = `
      fn fact(n) {
        if n <= 1 {
          return 1
        }
        return n * fact(n - 1)
      }
      print(fact(5))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["120"]);
  });

  test("C-SEM-10: Left-to-Right Function Argument Evaluation Order", () => {
    const src = `
      import array
      let log = []
      fn track(val) {
        array.push(log, val)
        return val
      }
      fn target(a, b, c) {
        return a + b + c
      }
      let r = target(track("x"), track("y"), track("z"))
      print(log[0] + log[1] + log[2])
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["xyz"]);
  });
});
