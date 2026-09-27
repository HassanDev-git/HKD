/**
 * HKD 1.0 Conformance Suite: Functions and Closures (tests/conformance/functions_and_closures.test.ts)
 *
 * Validates function definitions, first-class functions, higher-order functions,
 * closure lexical capture, upvalues, and recursion.
 */

import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-fn>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("HKD 1.0 Language Conformance — Functions & Closures", () => {
  test("C-FN-01: Basic Function Declaration and Parameter Passing", () => {
    const src = `
      fn greet(name) {
        return "Hello, " + name
      }
      print(greet("HKD"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["Hello, HKD"]);
  });

  test("C-FN-02: Multi-argument Functions and Arity Matching", () => {
    const src = `
      fn calculate(a, b, c) {
        return (a + b) * c
      }
      print(calculate(2, 3, 4))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["20"]);
  });

  test("C-FN-03: First-Class Functions (Passing Functions as Arguments)", () => {
    const src = `
      fn applyTwice(f, x) {
        return f(f(x))
      }
      fn double(n) {
        return n * 2
      }
      print(applyTwice(double, 5))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["20"]);
  });

  test("C-FN-04: Higher-Order Functions (Returning Functions)", () => {
    const src = `
      fn multiplier(factor) {
        fn multiply(x) {
          return x * factor
        }
        return multiply
      }
      let triple = multiplier(3)
      print(triple(7))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["21"]);
  });

  test("C-FN-05: Closures Capturing Outer Parameter State", () => {
    const src = `
      fn makeAdder(base) {
        return fn(x) {
          return base + x
        }
      }
      let add10 = makeAdder(10)
      let add50 = makeAdder(50)
      print(add10(5))
      print(add50(5))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["15", "55"]);
  });

  test("C-FN-06: Independent State Across Closure Instances", () => {
    const src = `
      fn makePrefixer(prefix) {
        fn apply(msg) {
          return prefix + ": " + msg
        }
        return apply
      }
      let info = makePrefixer("INFO")
      let warn = makePrefixer("WARN")
      print(info("start"))
      print(warn("alert"))
      print(info("done"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["INFO: start", "WARN: alert", "INFO: done"]);
  });

  test("C-FN-07: Nested Closures with Captured State", () => {
    const src = `
      fn makeGreeter(greeting) {
        fn greet(name) {
          return greeting + ", " + name + "!"
        }
        return greet
      }
      let hello = makeGreeter("Hello")
      print(hello("World"))
      let hola = makeGreeter("Hola")
      print(hola("HKD"))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["Hello, World!", "Hola, HKD!"]);
  });

  test("C-FN-08: Early Return Inside Loop", () => {
    const src = `
      fn findFirstEven(arr) {
        for x in arr {
          if x % 2 == 0 {
            return x
          }
        }
        return -1
      }
      print(findFirstEven([1, 3, 5, 8, 9]))
      print(findFirstEven([1, 3, 5]))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["8", "-1"]);
  });

  test("C-FN-09: Recursive Fibonacci Implementation", () => {
    const src = `
      fn fib(n) {
        if n <= 0 { return 0 }
        if n == 1 { return 1 }
        return fib(n - 1) + fib(n - 2)
      }
      print(fib(7))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["13"]);
  });

  test("C-FN-10: Void/Null Function Return Semantics", () => {
    const src = `
      fn doNothing() {}
      fn explicitEmpty() { return }
      print(doNothing() == null)
      print(explicitEmpty() == null)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["true", "true"]);
  });
});
