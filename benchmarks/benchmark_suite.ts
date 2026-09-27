import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import * as path from "path";
import * as fs from "fs";
import { ErrorReporter } from "../dist/errors/index.js";
import { Lexer } from "../dist/lexer/lexer.js";
import { Parser } from "../dist/parser/parser.js";
import { SemanticAnalyser } from "../dist/semantic/analyser.js";
import { Compiler } from "../dist/bytecode/compiler.js";
import { serializeProgram } from "../dist/bytecode/serializer.js";

interface BenchmarkResult {
  workload: string;
  file: string;
  iterations: number;
  refMedianMs: number;
  refP95Ms: number;
  nativeMedianMs: number;
  nativeP95Ms: number;
  nativeSpeedup: string;
}

interface BaselineReport {
  timestamp: string;
  version: string;
  system: {
    platform: string;
    arch: string;
    nodeVersion: string;
  };
  nativeBinarySizeBytes: number;
  workloads: BenchmarkResult[];
}

const RUNS = 5;
const WARMUPS = 2;
const ROOT_DIR = process.cwd();
const CLI_PATH = path.join(ROOT_DIR, "dist", "cli", "main.js");
const NATIVE_EXE = path.join(ROOT_DIR, "native-runtime", "zig-out", "bin", process.platform === "win32" ? "hkd-runtime.exe" : "hkd-runtime");

const WORKLOADS = [
  { name: "startup", file: "benchmarks/minimal.hkd" },
  { name: "fib(30)", file: "benchmarks/fib.hkd" },
  { name: "loop (1M)", file: "benchmarks/loop.hkd" },
  { name: "function_calls", file: "benchmarks/function_calls.hkd" },
  { name: "closures", file: "benchmarks/closures.hkd" },
  { name: "arrays", file: "benchmarks/array.hkd" },
  { name: "objects", file: "benchmarks/object.hkd" },
  { name: "strings", file: "benchmarks/string.hkd" },
  { name: "modules", file: "benchmarks/module_import.hkd" },
  { name: "async_tasks", file: "benchmarks/async_tasks.hkd" },
  { name: "timers", file: "benchmarks/timers.hkd" },
  { name: "tcp_buffers", file: "benchmarks/tcp.hkd" },
  { name: "http_client", file: "benchmarks/http_client.hkd" },
  { name: "http_server", file: "benchmarks/http_server.hkd" },
  { name: "filesystem", file: "benchmarks/filesystem.hkd" },
  { name: "subprocess", file: "benchmarks/subprocess.hkd" },
  { name: "memory_stress", file: "benchmarks/memory_stress.hkd" },
];

function compileToHkdb(srcPath: string, hkdbPath: string): boolean {
  try {
    const source = fs.readFileSync(srcPath, "utf-8");
    const reporter = new ErrorReporter(source, srcPath);
    const lexer = new Lexer(source, srcPath, reporter);
    const tokens = lexer.tokenize();
    if (reporter.hasErrors()) return false;
    const parser = new Parser(tokens, source, srcPath, reporter);
    const ast = parser.parse();
    if (reporter.hasErrors()) return false;
    const analyser = new SemanticAnalyser(reporter, source);
    analyser.analyse(ast);
    if (reporter.hasErrors()) return false;
    const compiler = new Compiler(reporter);
    const chunk = compiler.compile(ast);
    const binary = serializeProgram(chunk);
    fs.writeFileSync(hkdbPath, binary);
    return true;
  } catch {
    return false;
  }
}

function runRefVm(filePath: string): number {
  const start = performance.now();
  spawnSync("node", [CLI_PATH, "run", filePath], { cwd: ROOT_DIR, encoding: "utf-8" });
  return performance.now() - start;
}

function runNativeVm(hkdbPath: string): number {
  const start = performance.now();
  spawnSync(NATIVE_EXE, [hkdbPath], { cwd: ROOT_DIR, encoding: "utf-8" });
  return performance.now() - start;
}

function computePercentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function runSuite(): BaselineReport {
  console.log("=== HKD Phase 9A Baseline Benchmark Suite ===");
  console.log(`Node.js Version: ${process.version}`);
  console.log(`Platform: ${process.platform} (${process.arch})`);

  let exeSize = 0;
  if (fs.existsSync(NATIVE_EXE)) {
    exeSize = fs.statSync(NATIVE_EXE).size;
    console.log(`Native Executable Size: ${(exeSize / (1024 * 1024)).toFixed(2)} MB (${exeSize} bytes)\n`);
  }

  const results: BenchmarkResult[] = [];

  for (const w of WORKLOADS) {
    const fullPath = path.join(ROOT_DIR, w.file);
    if (!fs.existsSync(fullPath)) continue;

    const hkdbPath = fullPath.replace(/\.hkd$/, ".hkdb");
    const compiledOk = compileToHkdb(fullPath, hkdbPath);

    process.stdout.write(`Benchmarking [${w.name.padEnd(16)}] `);

    // 1. Benchmark Reference VM
    for (let i = 0; i < WARMUPS; i++) runRefVm(fullPath);
    const refTimes: number[] = [];
    for (let i = 0; i < RUNS; i++) refTimes.push(runRefVm(fullPath));
    refTimes.sort((a, b) => a - b);
    const refMedian = refTimes[Math.floor(refTimes.length / 2)];
    const refP95 = computePercentile(refTimes, 95);

    // 2. Benchmark Native Zig VM
    let nativeMedian = 0;
    let nativeP95 = 0;
    let speedup = "N/A";

    if (compiledOk && fs.existsSync(NATIVE_EXE)) {
      for (let i = 0; i < WARMUPS; i++) runNativeVm(hkdbPath);
      const nativeTimes: number[] = [];
      for (let i = 0; i < RUNS; i++) nativeTimes.push(runNativeVm(hkdbPath));
      nativeTimes.sort((a, b) => a - b);
      nativeMedian = nativeTimes[Math.floor(nativeTimes.length / 2)];
      nativeP95 = computePercentile(nativeTimes, 95);
      speedup = nativeMedian > 0 ? `${(refMedian / nativeMedian).toFixed(2)}x` : "N/A";
    }

    console.log(`Ref: ${refMedian.toFixed(2).padStart(6)} ms | Native: ${nativeMedian.toFixed(2).padStart(6)} ms | Speedup: ${speedup}`);

    results.push({
      workload: w.name,
      file: w.file,
      iterations: RUNS,
      refMedianMs: parseFloat(refMedian.toFixed(2)),
      refP95Ms: parseFloat(refP95.toFixed(2)),
      nativeMedianMs: parseFloat(nativeMedian.toFixed(2)),
      nativeP95Ms: parseFloat(nativeP95.toFixed(2)),
      nativeSpeedup: speedup,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    version: "0.1.0-phase9a-baseline",
    system: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    nativeBinarySizeBytes: exeSize,
    workloads: results,
  };
}

function main() {
  const report = runSuite();

  // Save JSON report
  const jsonPath = path.join(ROOT_DIR, "benchmarks", "baseline_v1.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`\nMachine-readable baseline saved to: ${jsonPath}`);

  // Generate Markdown report
  let md = "# HKD Phase 9A — Performance Baseline Report\n\n";
  md += `Generated on: \`${report.timestamp}\`\n`;
  md += `Platform: \`${report.system.platform} (${report.system.arch})\` | Node: \`${report.system.nodeVersion}\`\n`;
  md += `Native Binary Size: \`${(report.nativeBinarySizeBytes / (1024 * 1024)).toFixed(2)} MB\` (${report.nativeBinarySizeBytes} bytes)\n\n`;
  md += "| Workload | Ref VM Median (ms) | Ref VM p95 (ms) | Native VM Median (ms) | Native VM p95 (ms) | Native Speedup |\n";
  md += "| :--- | :---: | :---: | :---: | :---: | :---: |\n";

  for (const w of report.workloads) {
    md += `| **${w.workload}** | ${w.refMedianMs.toFixed(2)} | ${w.refP95Ms.toFixed(2)} | ${w.nativeMedianMs.toFixed(2)} | ${w.nativeP95Ms.toFixed(2)} | **${w.nativeSpeedup}** |\n`;
  }

  const mdPath = path.join(ROOT_DIR, "benchmarks", "baseline_v1.md");
  fs.writeFileSync(mdPath, md);
  console.log(`Markdown report saved to: ${mdPath}\n`);
}

main();
