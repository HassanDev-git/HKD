/**
 * HKD Phase 9 Workload Matrix Specification (CommonJS)
 */

const path = require("path");

function getBaselineWorkloadMatrix(baseDir = process.cwd()) {
  const workloadsDir = path.join(baseDir, "benchmarks", "phase9", "workloads");

  return [
    // ── 1. Startup ───────────────────────────────────────────────────────────
    {
      id: "startup_cli",
      name: "CLI Version Startup",
      category: "startup",
      executionType: "cli_process",
      commandArgs: ["--version"],
      description: "Measures instantaneous CLI process startup and version resolution",
      expectedOutput: "HKD 1.1.0",
      timeoutMs: 15000,
    },
    {
      id: "startup_minimal",
      name: "Cold Script Startup",
      category: "startup",
      executionType: "cli_process",
      sourceFile: path.join(workloadsDir, "minimal.hkd"),
      commandArgs: ["run", path.join(workloadsDir, "minimal.hkd")],
      description: "Measures cold process startup and execution of minimal script",
      expectedOutput: "ready",
      timeoutMs: 15000,
    },

    // ── 2. Compiler ──────────────────────────────────────────────────────────
    {
      id: "compiler_small",
      name: "Small Source Compilation",
      category: "compiler",
      executionType: "compiler_pipeline",
      sourceFile: path.join(workloadsDir, "compiler_small.hkd"),
      edition: "2026",
      description: "Measures full lexing, parsing, semantic checking, and bytecode emission (<50 LOC)",
      timeoutMs: 15000,
    },
    {
      id: "compiler_medium",
      name: "Medium Project Compilation",
      category: "compiler",
      executionType: "compiler_pipeline",
      sourceFile: path.join(workloadsDir, "compiler_medium.hkd"),
      edition: "2026",
      description: "Measures compiler throughput on medium-sized modular program (~300 LOC)",
      timeoutMs: 20000,
    },
    {
      id: "compiler_large",
      name: "Large Workload Compilation",
      category: "compiler",
      executionType: "compiler_pipeline",
      sourceFile: path.join(workloadsDir, "compiler_large.hkd"),
      edition: "2026",
      description: "Measures multi-module compiler pipeline stress (~1200 LOC)",
      timeoutMs: 30000,
    },

    // ── 3. Arithmetic ────────────────────────────────────────────────────────
    {
      id: "arithmetic_integer",
      name: "Integer Arithmetic Loop",
      category: "arithmetic",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "arithmetic_integer.hkd"),
      edition: "2026",
      description: "Evaluates tight integer arithmetic (add, sub, mul, div, mod) across 100,000 iterations",
      expectedOutput: "49875000",
      timeoutMs: 30000,
    },
    {
      id: "arithmetic_numeric",
      name: "Floating-Point Numeric Math",
      category: "arithmetic",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "arithmetic_numeric.hkd"),
      edition: "2026",
      description: "Evaluates floating-point double arithmetic over 100,000 iterations",
      validateOutput: (out) => out.startsWith("2.00000499994"),
      timeoutMs: 30000,
    },
    {
      id: "loop_tight",
      name: "Tight Loop Counter",
      category: "arithmetic",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "loop_tight.hkd"),
      edition: "2026",
      description: "Measures pure bytecode loop branch and counter increment throughput (500,000 iterations)",
      expectedOutput: "500000",
      timeoutMs: 30000,
    },

    // ── 4. Control Flow ──────────────────────────────────────────────────────
    {
      id: "control_flow_branching",
      name: "Multi-Way Branching Logic",
      category: "control_flow",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "control_flow_branching.hkd"),
      edition: "2026",
      description: "Evaluates conditional branching and jump target prediction across 100,000 iterations",
      expectedOutput: "33334,33333,33333",
      timeoutMs: 30000,
    },
    {
      id: "control_flow_nested_loops",
      name: "Nested 2D Loop Traversal",
      category: "control_flow",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "control_flow_nested_loops.hkd"),
      edition: "2026",
      description: "Evaluates nested loop execution across 90,000 2D coordinate iterations",
      expectedOutput: "4266000",
      timeoutMs: 30000,
    },

    // ── 5. Functions ─────────────────────────────────────────────────────────
    {
      id: "function_calls",
      name: "Function Invocation Overhead",
      category: "functions",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "function_calls.hkd"),
      edition: "2026",
      description: "Measures function call frame creation, parameter passing, and return across 100,000 calls",
      expectedOutput: "100000",
      timeoutMs: 30000,
    },
    {
      id: "recursion_fib",
      name: "Recursive Fibonacci (n=20)",
      category: "functions",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "recursion_fib.hkd"),
      edition: "2026",
      description: "Measures deep call stack management and recursive unwinding (fib(20))",
      expectedOutput: "6765",
      timeoutMs: 30000,
    },

    // ── 6. Data Structures ───────────────────────────────────────────────────
    {
      id: "data_strings",
      name: "String Concatenation & Length",
      category: "data",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "data_strings.hkd"),
      edition: "2026",
      description: "Measures dynamic string buffer allocation, concatenation, and querying (5,000 appends)",
      expectedOutput: "5004",
      timeoutMs: 30000,
    },
    {
      id: "data_arrays",
      name: "Array Growth & Element Append",
      category: "data",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "data_arrays.hkd"),
      edition: "2026",
      description: "Measures dynamic array capacity expansion and element indexing (10,000 elements)",
      expectedOutput: "10000",
      timeoutMs: 30000,
    },
    {
      id: "data_objects",
      name: "Struct Property Mutation",
      category: "data",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "data_objects.hkd"),
      edition: "2026",
      description: "Measures struct instance field writes and property lookups (50,000 property cycles)",
      expectedOutput: "49999,50000",
      timeoutMs: 30000,
    },

    // ── 7. Runtime ───────────────────────────────────────────────────────────
    {
      id: "runtime_allocations",
      name: "Heap Allocation & GC Churn",
      category: "runtime",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "runtime_allocations.hkd"),
      edition: "2026",
      description: "Measures short-lived heap allocation and garbage collection reclamation pressure (5,000 objects)",
      expectedOutput: "5000",
      timeoutMs: 30000,
    },
    {
      id: "runtime_repeated_execution",
      name: "Repeated Steady-State Loop",
      category: "runtime",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "runtime_repeated_execution.hkd"),
      edition: "2026",
      description: "Measures sustained execution loop verifying steady-state runtime performance",
      expectedOutput: "125",
      timeoutMs: 30000,
    },

    // ── 8. Concurrency / Async ───────────────────────────────────────────────
    {
      id: "concurrency_async",
      name: "Async Task Execution (RFC-004)",
      category: "concurrency",
      executionType: "runtime_vm",
      sourceFile: path.join(workloadsDir, "concurrency_async.hkd"),
      edition: "2027",
      description: "Measures async function suspension, future resolution, and cooperative task scheduling",
      expectedOutput: "60",
      timeoutMs: 30000,
    },
  ];
}

module.exports = {
  getBaselineWorkloadMatrix,
};
