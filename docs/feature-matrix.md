# HKD Feature Truth Matrix

**Platform Target**: HKD 1.1.0  
**Status Taxonomy**:
- `FULL`: Complete production support across syntax, typing, IR, execution, tooling, tests, and documentation.
- `PARTIAL`: Functional core exists; bounded edge cases or execution engine subset.
- `EXPERIMENTAL`: Syntax directive or RFC approved; bounded or developmental runtime support.
- `UNSUPPORTED`: Not supported in this subsystem or target edition.

---

## Master Subsystems Feature Matrix

| Feature | Parser | Semantic Analyzer | HIR | MIR | Optimizer | Bytecode | Stack VM | Native VM | Baseline JIT | Optimizing JIT | AOT | LSP | DAP | Formatter | Linter | Debugger | Documentation | Tests |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Primitives (Int, Float, String, Bool, Null)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Structs & Compound Types** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Closures & Upvalues** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Generic Functions (RFC-001)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Call-Site Type Inference** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Pattern Matching (RFC-002)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Destructuring & Guards** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Result Type (RFC-005)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Functional Iterators (Array 2.0)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Traits / Contracts (RFC-003)** | EXP | EXP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | PART | UNSUP | FULL | FULL | UNSUP | FULL | FULL |
| **Async / Await (RFC-004)** | EXP | EXP | UNSUP | UNSUP | UNSUP | UNSUP | PART | PART | UNSUP | UNSUP | UNSUP | PART | UNSUP | FULL | FULL | UNSUP | FULL | FULL |
| **Language Editions (2026/2027)** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Package Management & Lockfiles** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **HTTP Server & Client Runtime** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **WASM / WASI Compilation** | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | UNSUP | FULL | FULL | UNSUP | FULL | FULL |
| **ARM64 Native Execution** | FULL | FULL | FULL | FULL | FULL | FULL | FULL | PART | PART | PART | PART | FULL | FULL | FULL | FULL | FULL | FULL | FULL |

---

## Detailed Subsystem Breakdown

### 1. Front-End (Lexer, Parser, AST, Semantics)
- **Lexer & Parser**: Complete top-down operator precedence (Pratt) parser for Edition 2026 and Edition 2027. Full support for generic syntax (`fn name<T>(...)`), pattern matching (`match ... { ... }`), and feature flags (`#feature(...)`).
- **Semantic Analyzer**: Robust symbol resolution, lexical scoping, type inference, exhaustiveness checks, and diagnostic reporting.
- **Traits & Async Handling**: Bounded as `EXPERIMENTAL`. The parser recognizes the feature gates and emits clear informative diagnostics regarding their RFC timeline (1.2 roadmap) without failing valid AST nodes.

### 2. Intermediate Representation & Bytecode ISA
- **HIR & MIR**: High-level desugaring and SSA mid-level representations with basic blocks and phi nodes.
- **Optimizations**: Constant folding, dead code elimination, copy propagation, common subexpression elimination, and inlining.
- **Bytecode Compiler**: Generates binary `.hkdb` chunks adhering to HKDB V2 specifications with constant pools and debug source maps.

### 3. Execution Engines
- **Stack VM**: The primary reference engine. 100% feature complete for all stable language constructs with zero memory leaks across 10,000 soak cycles.
- **Native Zig Runtime**: Standalone native binary runtime with Cheney copying garbage collection and native stdlib interfaces.
- **Baseline JIT**: Generates fast machine code templates for tight numeric and array loops.
- **Optimizing JIT**: Register allocation, trace optimization, and inline caching for dynamic property lookups.
- **Native AOT**: Produces standalone single-file executables via ahead-of-time bytecode and native runtime bundling.

### 4. Developer Tooling & IDE
- **LSP 2.0**: Implements hover, completion, definition, references, rename, semantic tokens, and document symbols.
- **DAP**: Implements DAP specification: launch/attach, breakpoints, stepping (in, out, over), local variable inspection, and expression evaluation.
- **Formatter & Linter**: AST-preserving idempotent code formatter and lint rules for dead code, unused variables, and style guidelines.
