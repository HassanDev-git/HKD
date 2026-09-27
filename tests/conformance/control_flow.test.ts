/**
 * HKD 1.0 Conformance Suite: Control Flow (tests/conformance/control_flow.test.ts)
 *
 * Validates branching, looping, break, continue, and nested control flow structures.
 */

import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-control-flow>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("HKD 1.0 Language Conformance — Control Flow", () => {
  test("C-CF-01: Basic If-Else Branching", () => {
    const src = `
      let x = 10
      if x > 5 {
        print("greater")
      } else {
        print("lesser")
      }
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["greater"]);
  });

  test("C-CF-02: Chained If-Else If-Else Cascades", () => {
    const src = `
      fn classify(n) {
        if n < 0 {
          print("negative")
        } else if n == 0 {
          print("zero")
        } else {
          print("positive")
        }
      }
      classify(-5)
      classify(0)
      classify(42)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["negative", "zero", "positive"]);
  });

  test("C-CF-03: While Loop Accumulation", () => {
    const src = `
      let sum = 0
      let i = 1
      while i <= 5 {
        sum = sum + i
        i = i + 1
      }
      print(sum)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["15"]);
  });

  test("C-CF-04: For-In Loop Over Arrays", () => {
    const src = `
      let names = ["alpha", "beta", "gamma"]
      for name in names {
        print(name)
      }
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["alpha", "beta", "gamma"]);
  });

  test("C-CF-05: Break in While Loop", () => {
    const src = `
      let n = 0
      while true {
        if n == 3 {
          break
        }
        n = n + 1
      }
      print(n)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3"]);
  });

  test("C-CF-06: Break in For-In Loop", () => {
    const src = `
      let stoppedAt = null
      for x in [10, 20, 30, 40] {
        if x == 30 {
          stoppedAt = x
          break
        }
      }
      print(stoppedAt)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["30"]);
  });

  test("C-CF-07: Continue in While Loop", () => {
    const src = `
      let i = 0
      let count = 0
      while i < 6 {
        i = i + 1
        if i % 2 == 0 {
          continue
        }
        count = count + 1
      }
      print(count)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3"]);
  });

  test("C-CF-08: Nested Loops with Inner Break", () => {
    const src = `
      let outerHits = 0
      let i = 0
      while i < 3 {
        let j = 0
        while j < 5 {
          if j == 2 {
            break
          }
          j = j + 1
        }
        outerHits = outerHits + 1
        i = i + 1
      }
      print(outerHits)
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3"]);
  });
});
