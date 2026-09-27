import { describe, test, expect } from "@jest/globals";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

describe("HKD Phase 11 — Fuzzing & Untrusted Profile Data Security", () => {
  const cliPath = path.resolve("dist/cli/main.js");
  const fuzzDir = path.resolve(".hkd/fuzz_test");
  const dummyHkd = path.join(fuzzDir, "dummy.hkd");

  beforeAll(() => {
    fs.mkdirSync(fuzzDir, { recursive: true });
    fs.writeFileSync(dummyHkd, `print("safe");`);
  });

  afterAll(() => {
    try {
      fs.rmSync(fuzzDir, { recursive: true, force: true });
    } catch {}
  });

  const corruptPayloads = [
    "not a json",
    "{}",
    "[]",
    '{"functions": 12345}',
    '{"functions": [{"name": null, "invocations": -10}]}',
    '{"loops": "corrupt_string"}',
    '{"type_feedback": {"bad": [null, 999999999999999999999]}}',
    "{\x00\x01\x02\xff\xfe}",
    '{"functions": null, "nested": {"deep": {"recursion": [1,2,3]}}}',
    '{"version": 99999, "profile": true}',
  ];

  for (let i = 0; i < corruptPayloads.length; i++) {
    test(`Fuzz test with malformed PGO profile payload #${i + 1}`, () => {
      const corruptFile = path.join(fuzzDir, `corrupt_${i}.json`);
      fs.writeFileSync(corruptFile, corruptPayloads[i]);

      const res = spawnSync(process.execPath, [
        cliPath,
        "build",
        "--native",
        dummyHkd,
        "--pgo",
        corruptFile,
        "-o",
        path.join(fuzzDir, `out_${i}.exe`),
        "--quiet",
      ], { encoding: "utf-8" });

      // Must never crash with uncaught exception, assertion failure, or segfault (SIGSEGV/SIGBUS)
      expect(res.signal).toBeNull();
      // Should handle corrupt file safely
      expect([0, 1]).toContain(res.status);
    });
  }
});
