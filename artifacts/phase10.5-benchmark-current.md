# HKD Phase 9A — Authoritative Performance Baseline v1

**Generated:** 2026-11-22T04:33:03.784Z  
**Baseline ID:** `phase9-baseline-v1` (Schema v1)  
**Language Version:** HKD 1.1.0  
**Git State:** Commit `2f900993741d18bf38f4de3815b5fbd92f37ff91` (branch: `main`, dirty: `true`)  

---

## 1. Executive Summary

This document establishes the official **Phase 9A Performance Baseline v1** for the HKD programming language. Every future optimization across VM dispatch, register architecture, compiler pipelines, memory layouts, and runtime concurrency in Phase 9 will be measured against the empirical metrics recorded in this document.

All 18 workloads were executed under standardized conditions (3 warmup passes, 5 measured passes). Every workload passed correctness assertions verifying deterministic output.

---

## 2. Environment Metadata

| Property | Value |
| :--- | :--- |
| **Operating System** | `win32` |
| **Architecture** | `x64` |
| **CPU Model** | Intel(R) Core(TM) i7-4900MQ CPU @ 2.80GHz |
| **Logical Cores** | 8 |
| **Total RAM** | 7.81 GB |
| **Node.js Runtime** | `v24.19.0` |
| **Zig Toolchain** | `0.16.0` |
| **Benchmark Command** | `node benchmarks/phase9/runner/run_baseline.cjs --out artifacts/phase10.5-benchmark-current.json` |
| **CPU Load (1m)** | `unavailable (os.loadavg is not supported on Windows)` |
| **CPU Frequency** | `unavailable (no portable frequency API)` |
| **Power Mode** | `unavailable (no portable power-mode API)` |
| **Thermal Data** | `unavailable (no portable thermal API)` |
| **TypeScript Toolchain** | `5.5.2` |
| **Build Mode** | `production` |
| **Runner Version** | `phase9-runner-1.0.0` |

---

## 3. Methodology & Measurement Guardrails

- **Workload Matrix**: 18 workloads spanning startup, compilation, arithmetic, control flow, functions, data structures, runtime heap, and async concurrency.
- **Warmup**: 3 unrecorded warmup passes precede measurement to eliminate JIT compilation or cache misses.
- **Sample Size**: 5 recorded iterations per workload.
- **Primary Metric**: **Median** (robust against environmental outliers and thread scheduling interruptions).
- **Secondary Metrics**: Mean, Sample Standard Deviation, Min, Max, p95, p99.
- **Timing Engine**: Monotonic high-resolution clock (`performance.now()`).
- **Memory**: Real-time RSS tracking (`process.memoryUsage().rss`).
- **Allocations**: Node/V8 heap instrumentation limitation noted; native allocation counters documented as unavailable.

---

## 4. Workload Results Matrix

| # | Workload | Category | Median (ms) | Mean (ms) | p95 (ms) | p99 (ms) | Peak RSS | Correctness |
| -: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :---: |
| 1 | **CLI Version Startup** | `startup` | **528.87** | 544.19 | 618.79 | 634.78 | 53.6 MB | ✓ PASS |
| 2 | **Cold Script Startup** | `startup` | **797.65** | 784.93 | 810.79 | 812.49 | 54.3 MB | ✓ PASS |
| 3 | **Small Source Compilation** | `compiler` | **2.79** | 2.68 | 3.54 | 3.60 | 55.7 MB | ✓ PASS |
| 4 | **Medium Project Compilation** | `compiler` | **6.56** | 6.52 | 7.41 | 7.45 | 59.9 MB | ✓ PASS |
| 5 | **Large Workload Compilation** | `compiler` | **40.42** | 44.66 | 53.23 | 53.49 | 75.5 MB | ✓ PASS |
| 6 | **Integer Arithmetic Loop** | `arithmetic` | **316.53** | 316.88 | 351.31 | 351.51 | 73.9 MB | ✓ PASS |
| 7 | **Floating-Point Numeric Math** | `arithmetic` | **303.13** | 320.00 | 402.69 | 409.50 | 73.8 MB | ✓ PASS |
| 8 | **Tight Loop Counter** | `arithmetic` | **482.21** | 517.70 | 629.65 | 650.41 | 73.8 MB | ✓ PASS |
| 9 | **Multi-Way Branching Logic** | `control_flow` | **205.86** | 206.58 | 230.24 | 234.83 | 74.1 MB | ✓ PASS |
| 10 | **Nested 2D Loop Traversal** | `control_flow` | **153.16** | 151.40 | 159.91 | 160.70 | 74.3 MB | ✓ PASS |
| 11 | **Function Invocation Overhead** | `functions` | **272.53** | 276.19 | 313.09 | 319.52 | 74.9 MB | ✓ PASS |
| 12 | **Recursive Fibonacci (n=20)** | `functions` | **51.96** | 50.41 | 55.68 | 55.91 | 77.3 MB | ✓ PASS |
| 13 | **String Concatenation & Length** | `data` | **23.31** | 27.38 | 46.06 | 50.52 | 80.9 MB | ✓ PASS |
| 14 | **Array Growth & Element Append** | `data` | **48.86** | 44.71 | 50.66 | 50.88 | 78.6 MB | ✓ PASS |
| 15 | **Struct Property Mutation** | `data` | **85.85** | 89.06 | 105.88 | 107.44 | 75.6 MB | ✓ PASS |
| 16 | **Heap Allocation & GC Churn** | `runtime` | **26.40** | 25.27 | 27.48 | 27.53 | 79.7 MB | ✓ PASS |
| 17 | **Repeated Steady-State Loop** | `runtime` | **216.65** | 213.25 | 232.28 | 234.66 | 84.7 MB | ✓ PASS |
| 18 | **Async Task Execution (RFC-004)** | `concurrency` | **7.05** | 6.18 | 7.36 | 7.39 | 85.0 MB | ✓ PASS |

---

## 5. Artifact Metrics

| Artifact | Path / Description | Size (Bytes) | Human Readable |
| :--- | :--- | ---: | ---: |
| **CLI Entrypoint** | `dist/cli/main.js` | 104,066 | 101.6 KB |
| **Native VM Binary** | `native-runtime/zig-out/bin/hkd-runtime.exe` | 1,145,856 | 1.09 MB |
| **Sample Bytecode** | `minimal.hkdb` | 79 | 79 B |

---

## 6. Detailed Workload Profiles

### 1. CLI Version Startup (`startup_cli`)
- **Category:** `startup`
- **Description:** Measures instantaneous CLI process startup and version resolution
- **Execution Type:** `cli_process`
- **Samples (ms):** `[538.8113, 511.5279, 528.8692, 502.97, 638.78]`
- **Statistical Summary:** Min: `502.97` ms | Median: `528.8692` ms | Mean: `544.1917` ms | Sample SD: `54.7193` ms | Max: `638.78` ms | p95: `618.7863` ms | p99: `634.7813` ms
- **Peak RSS:** `53.59 MB`
- **Verified Output:** `HKD 1.1.0`

### 2. Cold Script Startup (`startup_minimal`)
- **Category:** `startup`
- **Description:** Measures cold process startup and execution of minimal script
- **Execution Type:** `cli_process`
- **Samples (ms):** `[737.3991, 802.3183, 797.651, 812.9111, 774.373]`
- **Statistical Summary:** Min: `737.3991` ms | Median: `797.651` ms | Mean: `784.9305` ms | Sample SD: `30.0739` ms | Max: `812.9111` ms | p95: `810.7925` ms | p99: `812.4874` ms
- **Peak RSS:** `54.34 MB`
- **Verified Output:** `ready`

### 3. Small Source Compilation (`compiler_small`)
- **Category:** `compiler`
- **Description:** Measures full lexing, parsing, semantic checking, and bytecode emission (<50 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[3.6117, 2.7885, 2.1361, 3.2459, 1.6333]`
- **Statistical Summary:** Min: `1.6333` ms | Median: `2.7885` ms | Mean: `2.6831` ms | Sample SD: `0.8049` ms | Max: `3.6117` ms | p95: `3.5385` ms | p99: `3.5971` ms
- **Peak RSS:** `55.74 MB`
- **Verified Output:** `compiled 385 bytes`

### 4. Medium Project Compilation (`compiler_medium`)
- **Category:** `compiler`
- **Description:** Measures compiler throughput on medium-sized modular program (~300 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[6.3508, 6.5581, 7.2049, 7.4599, 5.0473]`
- **Statistical Summary:** Min: `5.0473` ms | Median: `6.5581` ms | Mean: `6.5242` ms | Sample SD: `0.9422` ms | Max: `7.4599` ms | p95: `7.4089` ms | p99: `7.4497` ms
- **Peak RSS:** `59.86 MB`
- **Verified Output:** `compiled 2796 bytes`

### 5. Large Workload Compilation (`compiler_large`)
- **Category:** `compiler`
- **Description:** Measures multi-module compiler pipeline stress (~1200 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[51.9159, 38.4016, 40.4245, 53.5584, 39.024]`
- **Statistical Summary:** Min: `38.4016` ms | Median: `40.4245` ms | Mean: `44.6649` ms | Sample SD: `7.428` ms | Max: `53.5584` ms | p95: `53.2299` ms | p99: `53.4927` ms
- **Peak RSS:** `75.47 MB`
- **Verified Output:** `compiled 39574 bytes`

### 6. Integer Arithmetic Loop (`arithmetic_integer`)
- **Category:** `arithmetic`
- **Description:** Evaluates tight integer arithmetic (add, sub, mul, div, mod) across 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[350.3097, 351.5554, 259.0868, 316.5293, 306.9415]`
- **Statistical Summary:** Min: `259.0868` ms | Median: `316.5293` ms | Mean: `316.8845` ms | Sample SD: `37.9436` ms | Max: `351.5554` ms | p95: `351.3063` ms | p99: `351.5056` ms
- **Peak RSS:** `73.91 MB`
- **Verified Output:** `49875000`

### 7. Floating-Point Numeric Math (`arithmetic_numeric`)
- **Category:** `arithmetic`
- **Description:** Evaluates floating-point double arithmetic over 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[255.7961, 368.6674, 303.1349, 261.2105, 411.1975]`
- **Statistical Summary:** Min: `255.7961` ms | Median: `303.1349` ms | Mean: `320.0013` ms | Sample SD: `68.096` ms | Max: `411.1975` ms | p95: `402.6915` ms | p99: `409.4963` ms
- **Peak RSS:** `73.81 MB`
- **Verified Output:** `2.0000049999422536`

### 8. Tight Loop Counter (`loop_tight`)
- **Category:** `arithmetic`
- **Description:** Measures pure bytecode loop branch and counter increment throughput (500,000 iterations)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[482.2147, 655.5931, 479.8072, 444.9898, 525.8943]`
- **Statistical Summary:** Min: `444.9898` ms | Median: `482.2147` ms | Mean: `517.6998` ms | Sample SD: `82.2549` ms | Max: `655.5931` ms | p95: `629.6533` ms | p99: `650.4051` ms
- **Peak RSS:** `73.82 MB`
- **Verified Output:** `500000`

### 9. Multi-Way Branching Logic (`control_flow_branching`)
- **Category:** `control_flow`
- **Description:** Evaluates conditional branching and jump target prediction across 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[235.9733, 194.834, 188.9066, 207.3207, 205.8632]`
- **Statistical Summary:** Min: `188.9066` ms | Median: `205.8632` ms | Mean: `206.5796` ms | Sample SD: `18.1339` ms | Max: `235.9733` ms | p95: `230.2428` ms | p99: `234.8272` ms
- **Peak RSS:** `74.10 MB`
- **Verified Output:** `33334,33333,33333`

### 10. Nested 2D Loop Traversal (`control_flow_nested_loops`)
- **Category:** `control_flow`
- **Description:** Evaluates nested loop execution across 90,000 2D coordinate iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[153.1628, 160.9021, 138.2472, 148.7455, 155.958]`
- **Statistical Summary:** Min: `138.2472` ms | Median: `153.1628` ms | Mean: `151.4031` ms | Sample SD: `8.5764` ms | Max: `160.9021` ms | p95: `159.9133` ms | p99: `160.7043` ms
- **Peak RSS:** `74.31 MB`
- **Verified Output:** `4266000`

### 11. Function Invocation Overhead (`function_calls`)
- **Category:** `functions`
- **Description:** Measures function call frame creation, parameter passing, and return across 100,000 calls
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[241.5162, 264.8698, 321.1277, 272.5298, 280.92]`
- **Statistical Summary:** Min: `241.5162` ms | Median: `272.5298` ms | Mean: `276.1927` ms | Sample SD: `29.0929` ms | Max: `321.1277` ms | p95: `313.0862` ms | p99: `319.5194` ms
- **Peak RSS:** `74.88 MB`
- **Verified Output:** `100000`

### 12. Recursive Fibonacci (n=20) (`recursion_fib`)
- **Category:** `functions`
- **Description:** Measures deep call stack management and recursive unwinding (fib(20))
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[54.5404, 51.9632, 51.0792, 55.965, 38.4912]`
- **Statistical Summary:** Min: `38.4912` ms | Median: `51.9632` ms | Mean: `50.4078` ms | Sample SD: `6.9433` ms | Max: `55.965` ms | p95: `55.6801` ms | p99: `55.908` ms
- **Peak RSS:** `77.30 MB`
- **Verified Output:** `6765`

### 13. String Concatenation & Length (`data_strings`)
- **Category:** `data`
- **Description:** Measures dynamic string buffer allocation, concatenation, and querying (5,000 appends)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[23.3065, 23.7332, 20.3678, 51.6366, 17.8338]`
- **Statistical Summary:** Min: `17.8338` ms | Median: `23.3065` ms | Mean: `27.3756` ms | Sample SD: `13.7711` ms | Max: `51.6366` ms | p95: `46.0559` ms | p99: `50.5205` ms
- **Peak RSS:** `80.89 MB`
- **Verified Output:** `5004`

### 14. Array Growth & Element Append (`data_arrays`)
- **Category:** `data`
- **Description:** Measures dynamic array capacity expansion and element indexing (10,000 elements)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[49.5673, 48.8583, 45.7451, 50.9353, 28.4429]`
- **Statistical Summary:** Min: `28.4429` ms | Median: `48.8583` ms | Mean: `44.7098` ms | Sample SD: `9.2904` ms | Max: `50.9353` ms | p95: `50.6617` ms | p99: `50.8806` ms
- **Peak RSS:** `78.61 MB`
- **Verified Output:** `10000`

### 15. Struct Property Mutation (`data_objects`)
- **Category:** `data`
- **Description:** Measures struct instance field writes and property lookups (50,000 property cycles)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[107.8271, 83.0327, 85.8539, 98.0834, 70.528]`
- **Statistical Summary:** Min: `70.528` ms | Median: `85.8539` ms | Mean: `89.065` ms | Sample SD: `14.3498` ms | Max: `107.8271` ms | p95: `105.8784` ms | p99: `107.4374` ms
- **Peak RSS:** `75.56 MB`
- **Verified Output:** `49999,50000`

### 16. Heap Allocation & GC Churn (`runtime_allocations`)
- **Category:** `runtime`
- **Description:** Measures short-lived heap allocation and garbage collection reclamation pressure (5,000 objects)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[22.682, 27.5473, 26.404, 27.225, 22.5097]`
- **Statistical Summary:** Min: `22.5097` ms | Median: `26.404` ms | Mean: `25.2736` ms | Sample SD: `2.4805` ms | Max: `27.5473` ms | p95: `27.4828` ms | p99: `27.5344` ms
- **Peak RSS:** `79.73 MB`
- **Verified Output:** `5000`

### 17. Repeated Steady-State Loop (`runtime_repeated_execution`)
- **Category:** `runtime`
- **Description:** Measures sustained execution loop verifying steady-state runtime performance
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[207.7791, 216.6545, 220.3942, 186.1711, 235.2574]`
- **Statistical Summary:** Min: `186.1711` ms | Median: `216.6545` ms | Mean: `213.2513` ms | Sample SD: `18.098` ms | Max: `235.2574` ms | p95: `232.2848` ms | p99: `234.6629` ms
- **Peak RSS:** `84.67 MB`
- **Verified Output:** `125`

### 18. Async Task Execution (RFC-004) (`concurrency_async`)
- **Category:** `concurrency`
- **Description:** Measures async function suspension, future resolution, and cooperative task scheduling
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[7.0476, 7.3972, 4.4638, 7.2215, 4.7849]`
- **Statistical Summary:** Min: `4.4638` ms | Median: `7.0476` ms | Mean: `6.183` ms | Sample SD: `1.4327` ms | Max: `7.3972` ms | p95: `7.3621` ms | p99: `7.3902` ms
- **Peak RSS:** `84.96 MB`
- **Verified Output:** `60`

---

## 7. Statistical & Environmental Limitations

1. **Sample Size ($n=5$):** The measured sample count is intentionally sized for rapid and repeatable baseline capture. p95 and p99 metrics should be interpreted as boundary indicators rather than high-confidence asymptotic percentiles.
2. **OS Scheduling & Thermal Variation:** Workloads executed on multi-tasking host systems are subject to thread contention and thermal throttling variance.
3. **Allocation Instrumentation:** In-depth heap allocation byte counters are marked unavailable in the reference VM due to Node/V8 runtime constraints; future native Zig profiling will record micro-allocations directly.

---

## 8. Reproduction Instructions

To reproduce this exact baseline on any compatible machine:
```bash
# 1. Build toolchain
npm run build

# 2. Execute authoritative Phase 9A baseline
node benchmarks/phase9/runner/run_baseline.cjs
```
