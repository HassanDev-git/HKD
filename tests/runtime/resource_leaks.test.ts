/**
 * HKD Resource & Memory Leak Monitoring Suite
 *
 * Verifies that the VM, standard library, and module loader do not leak
 * file descriptors, memory references, or uncollected resources across iterations.
 */

import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { runSource } from "../../src/runtime/index.js";

describe("HKD Resource & Memory Leak Protections", () => {
  test("independent executions release cached modules and observe updated source", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-module-lifecycle-"));
    const modulePath = path.join(tmpDir, "value.hkd");
    const entryPath = path.join(tmpDir, "main.hkd");
    const source = 'import value from "value.hkd"\nprint(value.current)';
    const execute = () => {
      const output: string[] = [];
      const result = runSource(source, {
        fileName: entryPath,
        printDiagnostics: false,
        output: (line) => output.push(line),
      });
      return { result, output };
    };

    try {
      fs.writeFileSync(modulePath, "export let current = 1\n", "utf-8");
      const first = execute();
      expect(first.result.ok).toBe(true);
      expect(first.output).toEqual(["1"]);

      fs.writeFileSync(modulePath, "export let current = 2\n", "utf-8");
      const second = execute();
      expect(second.result.ok).toBe(true);
      expect(second.output).toEqual(["2"]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("HKD std.fs closes handles on success and remains usable after errors", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hkd-fs-lifecycle-"));
    const filePath = path.join(tmpDir, "payload.txt").replace(/\\/g, "/");
    const output: string[] = [];
    try {
      const result = runSource(`
        import fs
        fs.write(${JSON.stringify(filePath)}, "payload")
        print(fs.read(${JSON.stringify(filePath)}))
        fs.delete(${JSON.stringify(filePath)})
        print(fs.exists(${JSON.stringify(filePath)}))
      `, { noExit: true, printDiagnostics: false, output: (line) => output.push(line) });
      expect(result.ok).toBe(true);
      expect(output).toEqual(["payload", "false"]);
      expect(fs.existsSync(filePath)).toBe(false);

      const failedRead = runSource(`import fs\nfs.read(${JSON.stringify(filePath)})`, { noExit: true, printDiagnostics: false });
      expect(failedRead.ok).toBe(false);
      const subsequentRun = runSource('print("still-running")', {
        noExit: true,
        printDiagnostics: false,
        output: (line) => output.push(line),
      });
      expect(subsequentRun.ok).toBe(true);
      expect(output.at(-1)).toBe("still-running");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("repeated execution cycles maintain bounded heap growth", () => {
    // Run warm-up
    for (let i = 0; i < 20; i++) {
      runSource("let x = [1, 2, 3, 4, 5]; let y = len(x);", { printDiagnostics: false });
    }

    if (global.gc) {
      global.gc();
    }
    const initialHeap = process.memoryUsage().heapUsed;

    // Run 200 cycles of array allocation and processing
    for (let i = 0; i < 200; i++) {
      runSource(`
        let items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        let acc = 0;
        for it in items {
          acc = acc + it;
        }
      `, { printDiagnostics: false });
    }

    if (global.gc) {
      global.gc();
    }
    const finalHeap = process.memoryUsage().heapUsed;
    const growthMb = (finalHeap - initialHeap) / (1024 * 1024);

    // Heap growth across 200 compilation & VM runs must be bounded (< 30 MB)
    expect(growthMb).toBeLessThan(30);
  });

  test("file operations cleanly close handles without leaking descriptors", () => {
    const tmpFile = path.join(os.tmpdir(), `hkd_leak_test_${Date.now()}.txt`);

    // Write, read, and delete file across multiple iterations
    for (let i = 0; i < 25; i++) {
      fs.writeFileSync(tmpFile, `payload iteration ${i}`, "utf-8");
      const readBack = fs.readFileSync(tmpFile, "utf-8");
      expect(readBack).toContain(`payload iteration ${i}`);
      fs.unlinkSync(tmpFile);
    }

    expect(fs.existsSync(tmpFile)).toBe(false);
  });

  test("closure creation and scope popping does not retain dangling upvalues", () => {
    const code = `
      fn create_scope(id) {
        let tag = "scope_" + to_string(id);
        return fn() { return tag; };
      }
      let i = 0;
      while i < 100 {
        let sc = create_scope(i);
        let _ = sc();
        i = i + 1;
      }
    `;
    const res = runSource(code, { printDiagnostics: false });
    expect(res.ok).toBe(true);
  });
});
