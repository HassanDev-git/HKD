# HKD Benchmark Comparison

Generated: 2026-11-22T04:51:22.619Z
Baseline: phase9-baseline-v1 (2026-10-24T01:22:56.806Z)
Candidate runs pooled: 3

Correctness was checked before timing comparison. Workloads are matched by ID and execution path. A result is flagged for investigation only when it is at least 20% slower and exceeds two combined standard errors. These flags are advisory; they do not fail CI.

## Source revision evidence

- Commit 2f900993741d18bf38f4de3815b5fbd92f37ff91 → 2f900993741d18bf38f4de3815b5fbd92f37ff91; dirty states true → true
- Commit 2f900993741d18bf38f4de3815b5fbd92f37ff91 → 2f900993741d18bf38f4de3815b5fbd92f37ff91; dirty states true → true
- Commit 2f900993741d18bf38f4de3815b5fbd92f37ff91 → 2f900993741d18bf38f4de3815b5fbd92f37ff91; dirty states true → true

## Workloads

| Workload | Path | Baseline median ms | Candidate median ms | Change | Candidate SD ms | Assessment |
|---|---|---:|---:|---:|---:|---|
| CLI Version Startup | cli_process | 170.7234 | 164.4148 | -3.7% | 6.3013 | NO REGRESSION FLAG |
| Cold Script Startup | cli_process | 191.3679 | 223.8391 | 16.97% | 45.5341 | NO REGRESSION FLAG |
| Small Source Compilation | compiler_pipeline | 0.6201 | 0.7462 | 20.34% | 1.1405 | NO REGRESSION FLAG |
| Medium Project Compilation | compiler_pipeline | 2.0257 | 1.744 | -13.91% | 2.0143 | NO REGRESSION FLAG |
| Large Workload Compilation | compiler_pipeline | 13.8275 | 16.6847 | 20.66% | 5.43 | NO REGRESSION FLAG |
| Integer Arithmetic Loop | runtime_vm | 79.745 | 92.7999 | 16.37% | 22.4887 | NO REGRESSION FLAG |
| Floating-Point Numeric Math | runtime_vm | 65.2671 | 72.4478 | 11% | 15.4992 | NO REGRESSION FLAG |
| Tight Loop Counter | runtime_vm | 134.7659 | 159.6454 | 18.46% | 23.5025 | NO REGRESSION FLAG |
| Multi-Way Branching Logic | runtime_vm | 87.831 | 84.4282 | -3.87% | 8.4144 | NO REGRESSION FLAG |
| Nested 2D Loop Traversal | runtime_vm | 50.4568 | 50.0132 | -0.88% | 9.9602 | NO REGRESSION FLAG |
| Function Invocation Overhead | runtime_vm | 64.0104 | 68.8676 | 7.59% | 10.7391 | NO REGRESSION FLAG |
| Recursive Fibonacci (n=20) | runtime_vm | 14.7781 | 14.5105 | -1.81% | 2.3152 | NO REGRESSION FLAG |
| String Concatenation & Length | runtime_vm | 4.6693 | 3.9799 | -14.76% | 1.3138 | NO REGRESSION FLAG |
| Array Growth & Element Append | runtime_vm | 8.7474 | 10.7442 | 22.83% | 3.284 | INVESTIGATE — slower beyond conservative noise guard |
| Struct Property Mutation | runtime_vm | 33.8608 | 32.0715 | -5.28% | 3.6505 | NO REGRESSION FLAG |
| Heap Allocation & GC Churn | runtime_vm | 8.1815 | 7.1811 | -12.23% | 4.3619 | NO REGRESSION FLAG |
| Repeated Steady-State Loop | runtime_vm | 46.4245 | 43.2753 | -6.78% | 4.8196 | NO REGRESSION FLAG |
| Async Task Execution (RFC-004) | runtime_vm | 1.6234 | 1.432 | -11.79% | 1.5331 | NO REGRESSION FLAG |
