# HKD Benchmarking Methodology

This document outlines the testing methodology, environment settings, and commands to run HKD performance benchmarks reproducibly.

---

## 1. Measurement System Parameters

To ensure measurements are repeatable and reliable, all performance tests must log the environment configuration.

### A. Environment Information (Template)
- **Host OS**: Windows 11 x64 / Linux x64 / macOS
- **CPU**: AMD Ryzen / Intel Core / Apple Silicon
- **RAM**: GB DDR4/DDR5
- **Node.js version**: v24.x
- **HKD version**: 0.1.0

### B. Standard Metrics
- **Wall-clock (Real) Time**: Total time from CLI process startup to exit.
- **CPU Time (System + User)**: The total processing time utilized by the OS.
- **Peak RSS (Resident Set Size)**: The maximum physical memory allocated by the process.

---

## 2. Benchmark Workload Descriptions

### A. CLI Startup Benchmarks
- `hkd --version`: Measures the bare minimum initialization latency of the JS engine and CLI router.
- `hkd --help`: Measures command-line module imports and printing overhead.

### B. Computational Benchmarks
- **Fibonacci (`fib(30)`)**: Checks function activation frames, recursion depth execution, stack overhead, and math.
- **Iteration Loop (1,000,000 runs)**: Checks basic instruction dispatch loops (`Op.Lt`, `Op.Add`, `Op.Jump`, etc.) speed.
- **String Concatenation (10,000 appends)**: Focuses on dynamic memory expansion and string allocating.
- **Array Push/Pop Operations (100,000 items)**: Measures heap array allocation pressure and VM-level push/pop ops.
- **Object Access (1,000,000 reads/writes)**: Focuses on native Map field lookups (`Op.GetField`/`Op.SetField`).

---

## 3. Benchmarking Script Execution

A test suite runner script `benchmarks/run_bench.ts` will automate compiling and executing.

```bash
# How to run the benchmark script
npx ts-node benchmarks/run_bench.ts
```

### Reproducibility Rules
- **Warmup runs**: Standard execution should run a benchmark 3 times to warm up OS and VM file-system caches before recording values.
- **Run Iterations**: Run the target program at least 5 times and report the **Median** time/memory.
- **Equivalent Conditions**: When comparing against Node.js or Bun directly, use code implementations that match the HKD logic.
- **No Gaming**: Avoid any benchmark-gaming (such as pre-evaluating benchmarks at compile time).
