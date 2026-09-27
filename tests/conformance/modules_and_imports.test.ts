/**
 * HKD 1.0 Conformance Suite: Modules and Imports (tests/conformance/modules_and_imports.test.ts)
 *
 * Validates module exports, import syntax, module caching, transitive dependency
 * resolution, and circular dependency detection.
 */

import * as fs from "fs";
import * as path from "path";
import { runSource } from "../../src/runtime/index.js";

function execute(src: string): { output: string[]; ok: boolean; error?: string } {
  const output: string[] = [];
  const res = runSource(src, {
    fileName: "<conformance-modules>",
    output: (s) => output.push(s),
    printDiagnostics: false,
  });
  return { output, ok: res.ok, error: res.error };
}

describe("HKD 1.0 Language Conformance — Modules & Imports", () => {
  const tempFiles: string[] = [];

  function createModule(name: string, content: string) {
    const fullPath = path.resolve(process.cwd(), name);
    fs.writeFileSync(fullPath, content, "utf-8");
    tempFiles.push(fullPath);
  }

  afterEach(() => {
    for (const f of tempFiles) {
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {}
      }
    }
    tempFiles.length = 0;
  });

  test("C-MOD-01: Export Variable and Function", () => {
    createModule("conf_mod_math.hkd", `
      export let PI = 3.14159
      export fn square(n) {
        return n * n
      }
    `);

    const src = `
      import m from "conf_mod_math.hkd"
      print(m.PI)
      print(m.square(4))
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["3.14159", "16"]);
  });

  test("C-MOD-02: Transitive Module Imports (A -> B -> C)", () => {
    createModule("conf_c.hkd", `
      export let base = 100
    `);
    createModule("conf_b.hkd", `
      import c from "conf_c.hkd"
      export fn get_total() {
        return c.base + 50
      }
    `);

    const src = `
      import b from "conf_b.hkd"
      print(b.get_total())
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["150"]);
  });

  test("C-MOD-03: Module Caching and Singleton Execution", () => {
    createModule("conf_state.hkd", `
      export let counter = 0
      export fn inc() {
        counter = counter + 1
        return counter
      }
    `);

    const src = `
      import s1 from "conf_state.hkd"
      import s2 from "conf_state.hkd"
      print(s1.inc())
      print(s2.inc())
    `;
    const { output, ok } = execute(src);
    expect(ok).toBe(true);
    expect(output).toEqual(["1", "2"]);
  });

  test("C-MOD-04: Circular Dependency Detection Prevents Deadlock", () => {
    createModule("conf_circ_a.hkd", `
      import b from "conf_circ_b.hkd"
      export let a = 1
    `);
    createModule("conf_circ_b.hkd", `
      import a from "conf_circ_a.hkd"
      export let b = 2
    `);

    const src = `import a from "conf_circ_a.hkd"`;
    const { ok, error } = execute(src);
    expect(ok).toBe(false);
    expect(error).toContain("Circular dependency detected");
  });

  test("C-MOD-05: Missing Module Returns Clear Error", () => {
    const src = `import missing from "non_existent_file_9999.hkd"`;
    const { ok } = execute(src);
    expect(ok).toBe(false);
  });
});
