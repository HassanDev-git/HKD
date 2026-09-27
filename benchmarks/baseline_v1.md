# HKD Phase 9A — Authoritative Performance Baseline v1

**Generated:** 2026-09-27T19:43:00.806Z  
**Baseline ID:** `phase9-baseline-v1` (Schema v1)  
**Language Version:** HKD 1.1.0  
**Git State:** Commit `d1173a4b04c534ef5bfd610d62ea50864d2b38b4` (branch: `main`, dirty: `true`)  

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
| **TypeScript Toolchain** | `5.5.2` |
| **Build Mode** | `production` |
| **Runner Version** | `phase9-runner-1.0.0` |

---

## 3. Methodology & Measurement Guardrails

- **Workload Matrix**: 18 workloads spanning startup, compilation, arithmetic, control flow, functions, data structures, runtime heap, and async concurrency.
- **Warmup**: 3 unrecorded warmup passes precede measurement to eliminate JIT compilation or cache misses.
- **Sample Size**: 5 recorded iterations per workload.
- **Primary Metric**: **Median** (robust against environmental outliers and thread scheduling interruptions).
- **Secondary Metrics**: Mean, Min, Max, p95, p99.
- **Timing Engine**: Monotonic high-resolution clock (`performance.now()`).
- **Memory**: Real-time RSS tracking (`process.memoryUsage().rss`).
- **Allocations**: Node/V8 heap instrumentation limitation noted; native allocation counters documented as unavailable.

---

## 4. Workload Results Matrix

| # | Workload | Category | Median (ms) | Mean (ms) | p95 (ms) | p99 (ms) | Peak RSS | Correctness |
| -: | :--- | :--- | ---: | ---: | ---: | ---: | ---: | :---: |
| 1 | **CLI Version Startup** | `startup` | **269.55** | 276.72 | 376.51 | 391.15 | 40.6 MB | ✓ PASS |
| 2 | **Cold Script Startup** | `startup` | **240.99** | 253.19 | 298.57 | 304.22 | 41.1 MB | ✓ PASS |
| 3 | **Small Source Compilation** | `compiler` | **0.81** | 0.88 | 1.14 | 1.15 | 42.5 MB | ✓ PASS |
| 4 | **Medium Project Compilation** | `compiler` | **3.16** | 4.21 | 7.58 | 8.07 | 43.8 MB | ✓ PASS |
| 5 | **Large Workload Compilation** | `compiler` | **16.39** | 16.62 | 23.69 | 24.48 | 72.2 MB | ✓ PASS |
| 6 | **Integer Arithmetic Loop** | `arithmetic` | **171.35** | 175.88 | 194.61 | 194.79 | 80.2 MB | ✓ PASS |
| 7 | **Floating-Point Numeric Math** | `arithmetic` | **87.63** | 88.11 | 94.73 | 95.27 | 80.4 MB | ✓ PASS |
| 8 | **Tight Loop Counter** | `arithmetic` | **202.85** | 203.03 | 207.82 | 208.68 | 80.5 MB | ✓ PASS |
| 9 | **Multi-Way Branching Logic** | `control_flow` | **183.05** | 231.37 | 363.83 | 380.72 | 81.0 MB | ✓ PASS |
| 10 | **Nested 2D Loop Traversal** | `control_flow` | **79.47** | 79.61 | 83.41 | 83.78 | 81.0 MB | ✓ PASS |
| 11 | **Function Invocation Overhead** | `functions` | **112.58** | 116.16 | 126.90 | 127.72 | 81.3 MB | ✓ PASS |
| 12 | **Recursive Fibonacci (n=20)** | `functions` | **15.93** | 17.31 | 20.89 | 20.92 | 83.7 MB | ✓ PASS |
| 13 | **String Concatenation & Length** | `data` | **13.15** | 13.29 | 16.63 | 17.21 | 85.7 MB | ✓ PASS |
| 14 | **Array Growth & Element Append** | `data` | **13.29** | 14.09 | 17.63 | 18.17 | 83.1 MB | ✓ PASS |
| 15 | **Struct Property Mutation** | `data` | **52.12** | 57.05 | 68.89 | 70.54 | 82.1 MB | ✓ PASS |
| 16 | **Heap Allocation & GC Churn** | `runtime` | **10.80** | 11.55 | 14.33 | 14.58 | 84.8 MB | ✓ PASS |
| 17 | **Repeated Steady-State Loop** | `runtime` | **76.39** | 75.63 | 79.65 | 79.97 | 82.2 MB | ✓ PASS |
| 18 | **Async Task Execution (RFC-004)** | `concurrency` | **1.30** | 1.27 | 1.65 | 1.72 | 87.2 MB | ✓ PASS |

---

## 5. Artifact Metrics

| Artifact | Path / Description | Size (Bytes) | Human Readable |
| :--- | :--- | ---: | ---: |
| **CLI Entrypoint** | `dist/cli/main.js` | 72,991 | 71.3 KB |
| **Native VM Binary** | `native-runtime/zig-out/bin/hkd-runtime.exe` | 1,145,344 | 1.09 MB |
| **Sample Bytecode** | `minimal.hkdb` | 79 | 79 B |

---

## 6. Detailed Workload Profiles

### 1. CLI Version Startup (`startup_cli`)
- **Category:** `startup`
- **Description:** Measures instantaneous CLI process startup and version resolution
- **Execution Type:** `cli_process`
- **Samples (ms):** `[394.81, 269.5464, 197.862, 218.0855, 303.3049]`
- **Statistical Summary:** Min: `197.862` ms | Median: `269.5464` ms | Mean: `276.7218` ms | Max: `394.81` ms | p95: `376.509` ms | p99: `391.1498` ms
- **Peak RSS:** `40.59 MB`
- **Verified Output:** `HKD 1.1.0`

### 2. Cold Script Startup (`startup_minimal`)
- **Category:** `startup`
- **Description:** Measures cold process startup and execution of minimal script
- **Execution Type:** `cli_process`
- **Samples (ms):** `[229.5487, 240.9873, 219.4493, 270.3165, 305.6279]`
- **Statistical Summary:** Min: `219.4493` ms | Median: `240.9873` ms | Mean: `253.1859` ms | Max: `305.6279` ms | p95: `298.5656` ms | p99: `304.2154` ms
- **Peak RSS:** `41.09 MB`
- **Verified Output:** `ready`

### 3. Small Source Compilation (`compiler_small`)
- **Category:** `compiler`
- **Description:** Measures full lexing, parsing, semantic checking, and bytecode emission (<50 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[1.0888, 1.1486, 0.7515, 0.806, 0.612]`
- **Statistical Summary:** Min: `0.612` ms | Median: `0.806` ms | Mean: `0.8814` ms | Max: `1.1486` ms | p95: `1.1366` ms | p99: `1.1462` ms
- **Peak RSS:** `42.47 MB`
- **Verified Output:** `compiled 385 bytes`

### 4. Medium Project Compilation (`compiler_medium`)
- **Category:** `compiler`
- **Description:** Measures compiler throughput on medium-sized modular program (~300 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[1.6482, 8.1875, 2.878, 5.1585, 3.1611]`
- **Statistical Summary:** Min: `1.6482` ms | Median: `3.1611` ms | Mean: `4.2067` ms | Max: `8.1875` ms | p95: `7.5817` ms | p99: `8.0663` ms
- **Peak RSS:** `43.75 MB`
- **Verified Output:** `compiled 2796 bytes`

### 5. Large Workload Compilation (`compiler_large`)
- **Category:** `compiler`
- **Description:** Measures multi-module compiler pipeline stress (~1200 LOC)
- **Execution Type:** `compiler_pipeline`
- **Samples (ms):** `[19.7187, 24.6786, 6.7336, 16.3897, 15.5747]`
- **Statistical Summary:** Min: `6.7336` ms | Median: `16.3897` ms | Mean: `16.6191` ms | Max: `24.6786` ms | p95: `23.6866` ms | p99: `24.4802` ms
- **Peak RSS:** `72.20 MB`
- **Verified Output:** `compiled 39574 bytes`

### 6. Integer Arithmetic Loop (`arithmetic_integer`)
- **Category:** `arithmetic`
- **Description:** Evaluates tight integer arithmetic (add, sub, mul, div, mod) across 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[171.3526, 194.84, 162.3179, 157.2249, 193.686]`
- **Statistical Summary:** Min: `157.2249` ms | Median: `171.3526` ms | Mean: `175.8843` ms | Max: `194.84` ms | p95: `194.6092` ms | p99: `194.7938` ms
- **Peak RSS:** `80.20 MB`
- **Verified Output:** `49875000`

### 7. Floating-Point Numeric Math (`arithmetic_numeric`)
- **Category:** `arithmetic`
- **Description:** Evaluates floating-point double arithmetic over 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[87.6255, 92.0155, 95.4025, 84.2879, 81.2138]`
- **Statistical Summary:** Min: `81.2138` ms | Median: `87.6255` ms | Mean: `88.109` ms | Max: `95.4025` ms | p95: `94.7251` ms | p99: `95.267` ms
- **Peak RSS:** `80.41 MB`
- **Verified Output:** `2.0000049999422536`

### 8. Tight Loop Counter (`loop_tight`)
- **Category:** `arithmetic`
- **Description:** Measures pure bytecode loop branch and counter increment throughput (500,000 iterations)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[201.7082, 198.1857, 208.8977, 202.8458, 203.4934]`
- **Statistical Summary:** Min: `198.1857` ms | Median: `202.8458` ms | Mean: `203.0262` ms | Max: `208.8977` ms | p95: `207.8168` ms | p99: `208.6815` ms
- **Peak RSS:** `80.48 MB`
- **Verified Output:** `500000`

### 9. Multi-Way Branching Logic (`control_flow_branching`)
- **Category:** `control_flow`
- **Description:** Evaluates conditional branching and jump target prediction across 100,000 iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[384.9474, 279.3584, 183.0496, 158.4462, 151.0491]`
- **Statistical Summary:** Min: `151.0491` ms | Median: `183.0496` ms | Mean: `231.3701` ms | Max: `384.9474` ms | p95: `363.8296` ms | p99: `380.7238` ms
- **Peak RSS:** `80.96 MB`
- **Verified Output:** `33334,33333,33333`

### 10. Nested 2D Loop Traversal (`control_flow_nested_loops`)
- **Category:** `control_flow`
- **Description:** Evaluates nested loop execution across 90,000 2D coordinate iterations
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[83.8781, 75.8953, 81.542, 77.2381, 79.4723]`
- **Statistical Summary:** Min: `75.8953` ms | Median: `79.4723` ms | Mean: `79.6052` ms | Max: `83.8781` ms | p95: `83.4109` ms | p99: `83.7847` ms
- **Peak RSS:** `80.96 MB`
- **Verified Output:** `4266000`

### 11. Function Invocation Overhead (`function_calls`)
- **Category:** `functions`
- **Description:** Measures function call frame creation, parameter passing, and return across 100,000 calls
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[122.7964, 127.9202, 106.2728, 111.2393, 112.5808]`
- **Statistical Summary:** Min: `106.2728` ms | Median: `112.5808` ms | Mean: `116.1619` ms | Max: `127.9202` ms | p95: `126.8954` ms | p99: `127.7152` ms
- **Peak RSS:** `81.29 MB`
- **Verified Output:** `100000`

### 12. Recursive Fibonacci (n=20) (`recursion_fib`)
- **Category:** `functions`
- **Description:** Measures deep call stack management and recursive unwinding (fib(20))
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[20.9295, 15.9321, 14.2826, 14.6713, 20.724]`
- **Statistical Summary:** Min: `14.2826` ms | Median: `15.9321` ms | Mean: `17.3079` ms | Max: `20.9295` ms | p95: `20.8884` ms | p99: `20.9213` ms
- **Peak RSS:** `83.70 MB`
- **Verified Output:** `6765`

### 13. String Concatenation & Length (`data_strings`)
- **Category:** `data`
- **Description:** Measures dynamic string buffer allocation, concatenation, and querying (5,000 appends)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[13.7087, 17.3575, 13.1512, 11.7156, 10.5141]`
- **Statistical Summary:** Min: `10.5141` ms | Median: `13.1512` ms | Mean: `13.2894` ms | Max: `17.3575` ms | p95: `16.6277` ms | p99: `17.2115` ms
- **Peak RSS:** `85.74 MB`
- **Verified Output:** `5004`

### 14. Array Growth & Element Append (`data_arrays`)
- **Category:** `data`
- **Description:** Measures dynamic array capacity expansion and element indexing (10,000 elements)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[18.3105, 14.8877, 13.2869, 13.0872, 10.8871]`
- **Statistical Summary:** Min: `10.8871` ms | Median: `13.2869` ms | Mean: `14.0919` ms | Max: `18.3105` ms | p95: `17.6259` ms | p99: `18.1736` ms
- **Peak RSS:** `83.13 MB`
- **Verified Output:** `10000`

### 15. Struct Property Mutation (`data_objects`)
- **Category:** `data`
- **Description:** Measures struct instance field writes and property lookups (50,000 property cycles)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[70.9545, 52.1212, 50.9947, 50.5372, 60.6476]`
- **Statistical Summary:** Min: `50.5372` ms | Median: `52.1212` ms | Mean: `57.051` ms | Max: `70.9545` ms | p95: `68.8931` ms | p99: `70.5422` ms
- **Peak RSS:** `82.15 MB`
- **Verified Output:** `49999,50000`

### 16. Heap Allocation & GC Churn (`runtime_allocations`)
- **Category:** `runtime`
- **Description:** Measures short-lived heap allocation and garbage collection reclamation pressure (5,000 objects)
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[10.8034, 13.1136, 9.6477, 9.5417, 14.6369]`
- **Statistical Summary:** Min: `9.5417` ms | Median: `10.8034` ms | Mean: `11.5487` ms | Max: `14.6369` ms | p95: `14.3322` ms | p99: `14.576` ms
- **Peak RSS:** `84.81 MB`
- **Verified Output:** `5000`

### 17. Repeated Steady-State Loop (`runtime_repeated_execution`)
- **Category:** `runtime`
- **Description:** Measures sustained execution loop verifying steady-state runtime performance
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[76.3906, 71.2815, 72.3739, 78.0792, 80.0436]`
- **Statistical Summary:** Min: `71.2815` ms | Median: `76.3906` ms | Mean: `75.6338` ms | Max: `80.0436` ms | p95: `79.6507` ms | p99: `79.965` ms
- **Peak RSS:** `82.22 MB`
- **Verified Output:** `125`

### 18. Async Task Execution (RFC-004) (`concurrency_async`)
- **Category:** `concurrency`
- **Description:** Measures async function suspension, future resolution, and cooperative task scheduling
- **Execution Type:** `runtime_vm`
- **Samples (ms):** `[0.8315, 1.3013, 1.1451, 1.3181, 1.7331]`
- **Statistical Summary:** Min: `0.8315` ms | Median: `1.3013` ms | Mean: `1.2658` ms | Max: `1.7331` ms | p95: `1.6501` ms | p99: `1.7165` ms
- **Peak RSS:** `87.18 MB`
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
