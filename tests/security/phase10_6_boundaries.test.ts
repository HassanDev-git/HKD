import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import { packArchive, unpackArchive } from "../../src/package-manager/archive.js";
import { generateDockerfile } from "../../src/deploy/container.js";

describe("Phase 10.6 boundary regressions", () => {
  let dir: string;
  beforeEach(() => {
    fs.mkdirSync(path.resolve("scratch"), { recursive: true });
    dir = fs.mkdtempSync(path.resolve("scratch/phase106-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("package extraction refuses existing junctions without writing outside its destination", () => {
    const source = path.join(dir, "source");
    const target = path.join(dir, "target");
    const outside = path.join(dir, "outside");
    fs.mkdirSync(path.join(source, "escape"), { recursive: true });
    fs.mkdirSync(target); fs.mkdirSync(outside);
    fs.writeFileSync(path.join(source, "escape", "marker"), "data");
    const packed = packArchive(source, { name: "probe", version: "1.0.0", dependencies: {}, devDependencies: {} });
    fs.symlinkSync(outside, path.join(target, "escape"), process.platform === "win32" ? "junction" : "dir");
    expect(() => unpackArchive(packed.buffer, target)).toThrow(/SEC005/);
    expect(fs.existsSync(path.join(outside, "marker"))).toBe(false);
    expect(() => packArchive(target, { name: "probe", version: "1.0.0", dependencies: {}, devDependencies: {} })).toThrow(/SEC005/);
  });

  test.each(["C:/secret.hkd", "--from=other.hkd", "*.hkd", "x y.hkd", "../x.hkd", "x\nRUN touch file.hkd"])("container rejects unsafe entry %s", (entry) => {
    expect(() => generateDockerfile({ entry })).toThrow(/project-relative/);
  });

  test("benchmark rejects an incorrect early measurement even if later samples would pass", () => {
    const output = path.join(dir, "invalid-report.json");
    const script = `
      let calls = 0;
      require('./dist/runtime/index.js').runFile = (_file, options) => {
        options.output(++calls === 4 ? 'incorrect' : 'ready'); return {ok:true};
      };
      require('./benchmarks/phase9/runner/workload.cjs').getBaselineWorkloadMatrix = () => [{
        id:'probe', name:'probe', executionType:'runtime_vm', sourceFile:'unused', expectedOutput:'ready'
      }];
      require('./benchmarks/phase9/runner/run_baseline.cjs').runBaselineSuite({out:${JSON.stringify(output)}});
    `;
    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: { ...process.env, NODE_ENV: "production" } });
    expect(result.status).toBe(1);
    expect(fs.existsSync(output)).toBe(false);
  });

  test("comparison refuses partial runs, duplicate IDs and nonnumeric samples", () => {
    const { compare } = require("../../scripts/compare-benchmarks.cjs");
    const base = require("../../artifacts/phase10.4-benchmark-initial.json");
    for (const mutate of [
      (r: any) => r.workloads.pop(),
      (r: any) => r.workloads.push(r.workloads[0]),
      (r: any) => r.workloads[0].samples_ms[0] = null,
    ]) {
      const candidate = JSON.parse(JSON.stringify(base)); mutate(candidate);
      expect(() => compare(base, [candidate])).toThrow();
    }
  });

  test("native process startup failure cannot produce success status", () => {
    const preload = path.join(dir, "preload.cjs");
    fs.writeFileSync(preload, `
      const fs = require('fs'); const original = fs.existsSync;
      fs.existsSync = p => /hkd-runtime(?:\\.exe)?$/.test(String(p)) || original(p);
      require('child_process').spawnSync = () => ({status: null, error: new Error('native-startup-regression')});
    `);
    const source = path.join(dir, "main.hkd");
    fs.writeFileSync(source, 'print("ready");');
    const result = spawnSync(process.execPath, ["--require", preload, path.resolve("dist/cli/main.js"), "run", "--vm", source], { encoding: "utf8", env: { ...process.env, NODE_ENV: "production" } });
    if (result.status !== 1) throw new Error(JSON.stringify({status:result.status, stdout:result.stdout, stderr:result.stderr}));
    expect(result.stderr).toContain("native-startup-regression");
  });
});
