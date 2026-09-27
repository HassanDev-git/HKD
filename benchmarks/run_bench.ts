import { spawnSync } from "child_process";
import { performance } from "perf_hooks";
import * as path from "path";
import * as fs from "fs";

interface BenchCompareResult {
  name: string;
  args: string[];
  nodeTimeMs: number;
  standaloneTimeMs: number;
}

const RUNS = 5;
const WARMUPS = 3;

const CLI_PATH = path.resolve(__dirname, "../dist/cli/main.js");

const IS_WIN = process.platform === "win32";
const platformName = IS_WIN ? "windows-x64" : (process.platform === "darwin" ? "macos-x64" : "linux-x64");
const exeName = IS_WIN ? "hkd.exe" : "hkd";
const STANDALONE_PATH = path.resolve(__dirname, `../dist/releases/${platformName}/${exeName}`);

function runNodeCommand(args: string[]): number {
  const start = performance.now();
  const res = spawnSync("node", [CLI_PATH, ...args], { encoding: "utf-8" });
  const end = performance.now();
  if (res.status !== 0) {
    console.error(`Node command failed: node ${CLI_PATH} ${args.join(" ")}`);
    console.error(res.stderr);
  }
  return end - start;
}

function runStandaloneCommand(args: string[]): number {
  const start = performance.now();
  const res = spawnSync(STANDALONE_PATH, args, { encoding: "utf-8" });
  const end = performance.now();
  if (res.status !== 0) {
    console.error(`Standalone command failed: ${STANDALONE_PATH} ${args.join(" ")}`);
    console.error(res.stderr);
  }
  return end - start;
}

function benchmarkCompare(name: string, args: string[]): BenchCompareResult {
  // 1. Benchmark Node
  for (let i = 0; i < WARMUPS; i++) runNodeCommand(args);
  const nodeTimes: number[] = [];
  for (let i = 0; i < RUNS; i++) nodeTimes.push(runNodeCommand(args));
  nodeTimes.sort((a, b) => a - b);
  const nodeTime = nodeTimes[Math.floor(RUNS / 2)];

  // 2. Benchmark Standalone
  for (let i = 0; i < WARMUPS; i++) runStandaloneCommand(args);
  const standaloneTimes: number[] = [];
  for (let i = 0; i < RUNS; i++) standaloneTimes.push(runStandaloneCommand(args));
  standaloneTimes.sort((a, b) => a - b);
  const standaloneTime = standaloneTimes[Math.floor(RUNS / 2)];

  return {
    name,
    args,
    nodeTimeMs: parseFloat(nodeTime.toFixed(2)),
    standaloneTimeMs: parseFloat(standaloneTime.toFixed(2)),
  };
}

function main() {
  console.log("=== Running HKD Side-by-Side Comparison Benchmarks ===");
  if (!fs.existsSync(STANDALONE_PATH)) {
    console.error(`Standalone executable not found at: ${STANDALONE_PATH}`);
    console.error("Please run 'npm run package' first.");
    process.exit(1);
  }

  const exeSizeMb = (fs.statSync(STANDALONE_PATH).size / (1024 * 1024)).toFixed(2);
  console.log(`Standalone Executable Size: ${exeSizeMb} MB\n`);

  const results: BenchCompareResult[] = [];

  results.push(benchmarkCompare("CLI Version (--version)", ["--version"]));
  results.push(benchmarkCompare("CLI Help (--help)", ["--help"]));
  results.push(benchmarkCompare("Minimal Program Startup", ["run", "benchmarks/minimal.hkd"]));
  results.push(benchmarkCompare("Fibonacci (fib(30))", ["run", "benchmarks/fib.hkd"]));
  results.push(benchmarkCompare("1M Iteration Loop", ["run", "benchmarks/loop.hkd"]));
  results.push(benchmarkCompare("10,000 String Concatenation", ["run", "benchmarks/string.hkd"]));
  results.push(benchmarkCompare("100,000 Array Push/Pop Operations", ["run", "benchmarks/array.hkd"]));
  results.push(benchmarkCompare("500,000 Object Field Read/Writes", ["run", "benchmarks/object.hkd"]));
  results.push(benchmarkCompare("1,000 Module Load & Cache Hits", ["run", "benchmarks/module_load.hkd"]));

  console.log("| Benchmark Workload | Node HKD (ms) | Standalone HKD (ms) | Delta |");
  console.log("| :--- | :---: | :---: | :---: |");
  for (const r of results) {
    const delta = (r.standaloneTimeMs - r.nodeTimeMs).toFixed(2);
    const deltaStr = parseFloat(delta) >= 0 ? `+${delta} ms` : `${delta} ms`;
    console.log(`| ${r.name} | ${r.nodeTimeMs} ms | ${r.standaloneTimeMs} ms | ${deltaStr} |`);
  }
  console.log("\nBenchmarks completed successfully.");
}

main();
