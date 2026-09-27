# HKD Phase 3 — Developer Usability & Language Ergonomics Audit

**Date:** September 2026  
**Auditor:** Lead Compiler Engineer, Runtime Engineer & Developer Experience Lead  
**HKD Version Baseline:** 1.1.0 (Editions: 2026 Default, 2027 Opt-In)  
**Verification Baseline:** 101/101 test suites PASS, 798/798 tests PASS, 18/18 release gates PASS  

---

## 1. Executive Summary

This pre-implementation usability audit assesses the real-world developer experience of the HKD programming language across syntax, type checking, runtime execution, standard library, and developer tooling.

While HKD has achieved remarkable engineering milestones (18 automated release acceptance gates, differential execution between Native Zig VM and TypeScript Reference VM, bytecode serialization, JIT, AOT, and multi-platform packaging), **practical developer ergonomics** present several clear areas where developer friction can be removed without breaking changes.

This audit surveys each language feature, evaluates developer friction points, and provides the architectural basis for Phase 3 dogfooding and ergonomic enhancements.

---

## 2. Comprehensive Feature Survey & Developer Ergonomics

### 2.1 Variables & Constants
* **Syntax:** `let x = 10`, `const PI = 3.14159`, `let y: Int = 20`.
* **Usability & Semantics:**
  - `let` declarations are mutable. Reassignment via `=` and compound operators (`+=`, `-=`, `*=`, `/=`, `%=`) works as expected.
  - `const` declarations enforce immutability statically in the semantic analyser (`ErrorCode.E405: Cannot assign to \`x\` — it is declared \`const\``).
  - Scope shadowing is permitted and correctly handled in lexical scope frames.
  - Unused variables produce clean compiler warnings unless prefixed with an underscore (`_var`).
* **Ergonomic Friction:**
  - Uninitialized `let` declarations (e.g. `let mut_var;`) are parsed as `let mut_var = null;` with type `T_ANY`, allowing dynamic reassignment without explicit `Any` annotation.
  - Multi-variable destructuring (e.g., `let [a, b] = arr` or `let { name, age } = user`) is currently unsupported at declaration time; developers must manually index or project fields.

### 2.2 Functions & Closures
* **Syntax:** `fn name(param: Type) -> RetType { ... }`, anonymous `fn(x) { ... }`.
* **Usability & Semantics:**
  - First-class functions: functions can be assigned to variables, passed as arguments (HOFs), and returned from functions.
  - Default parameter values are supported (`fn greet(name: String, prefix: String = "Hello") -> String`).
  - Return statements support optional values; functions without an explicit return expression evaluate to `null` (`T_NULL`).
  - Closures capture lexical variables through scope frames; nested functions work correctly.
* **Ergonomic Friction:**
  - Return type annotation omission infers `T_ANY`, which eases prototyping but can degrade strict static type safety down the call chain.
  - Short closure syntax (e.g., `|x| x * 2` or `(x) => x * 2`) is not available; developers must write the full `fn(x) { return x * 2 }`, which adds syntactic noise when chaining collection operations (`map`, `filter`).

### 2.3 Structs & Data Modeling
* **Syntax:** `struct Point { x: Float, y: Float }`.
* **Usability & Semantics:**
  - Nominal structs with strongly typed fields.
  - Construction syntax: `Point { x: 1.0, y: 2.0 }`.
  - Member access: `p.x`, `p.y`.
  - Nested structs and arrays of structs are supported.
* **Ergonomic Friction (HIGH):**
  - **No Field Initialization Shorthand:** Writing `Point { x: x, y: y }` is strictly required. Omitting the value (`Point { x, y }`) fails with a syntax error because the parser mandates `:`.
  - **Missing Field Validation:** The semantic analyser validates that provided fields exist on the struct, but does not strictly reject missing fields that lack default values at construction time, leading to silent `null` values at runtime.
  - **No Struct Methods / Impl Blocks:** HKD currently requires free functions (`fn rect_area(r: Rectangle) -> Float`). Developers cannot write `r.area()` or `r.contains(p)`. This is the single largest developer ergonomics feedback item.

### 2.4 Collections: Arrays & Objects
* **Syntax:** `let a = [1, 2, 3]`, `let obj = { "key": "value", nested: 123 }`.
* **Usability & Semantics:**
  - Array type notation is `[T]` (e.g., `[Int]`, `[String]`).
  - Indexing: `a[0]`, `a[i] = v`.
  - Standard library `std.array` provides rich utilities: `push`, `pop`, `shift`, `unshift`, `join`, `slice`, `concat`, `reverse`, `sort`, `flat`, `contains`, `index_of`, `find`, `every`, `some`, `reduce`, `map`, `filter`, `take`, `skip`, `zip`, `enumerate`, `any`, `all`.
* **Ergonomic Friction (MEDIUM):**
  - Because struct methods / collection methods are free functions in the stdlib, developers must write `array.map(items, fn(x) { ... })` rather than chained calls `items.map(...).filter(...)`.
  - Array slicing syntax `a[1..3]` is not supported at the indexer syntax level; developers must call `array.slice(a, 1, 3)`.
  - Object literals cannot be created with shorthand `{ name, age }`.

### 2.5 Strings & Text Processing
* **Syntax:** Double-quoted strings `"hello\n"`.
* **Usability & Semantics:**
  - Standard string concatenation via `+`.
  - `std.string` provides: `upper`, `lower`, `trim`, `len`, `split`, `join`, `replace`, `contains`, `starts_with`, `ends_with`, `slice`, `index_of`, `repeat`, `char_at`, `char_code`, `from_char_code`, `format`.
  - `string.format("Hello {0}, you have {1} messages", name, count)` provides indexed templating.
* **Ergonomic Friction (MEDIUM):**
  - No direct template literal string interpolation syntax like `$"Hello {name}"` or `` `Hello ${name}` ``. String concatenation or `string.format` must be used.
  - String indexing `s[0]` returns `null` or raw character code depending on runtime context; developers are guided to use `string.char_at(s, i)`.

### 2.6 Generics & Type System
* **Syntax:** `fn id<T>(x: T) -> T { return x }`.
* **Usability & Semantics:**
  - Type parameters are validated in function declarations.
  - The type checker resolves type parameters to `TypeParamType` and permits flexible assignment where applicable.
* **Ergonomic Friction (MEDIUM):**
  - Struct definitions currently do not accept generic type parameters (e.g., `struct Box<T>` is not supported; `Result<T, E>` is supported as an intrinsic compiler type rather than a user-defined generic struct).
  - Trait bounds (`T: Display`) are part of RFC-003 and not yet active in Edition 2026.

### 2.7 Pattern Matching & Control Flow
* **Syntax:**
  ```hkd
  match val {
      1 => "one",
      2 => "two",
      _ => "other"
  }
  ```
* **Usability & Semantics:**
  - Literal patterns (ints, floats, strings, booleans, null).
  - Identifier binding patterns (`x => ...`).
  - Wildcard pattern (`_ => ...`).
  - Pattern guards (`x if x > 10 => ...`).
  - Array destructuring patterns (`[head, tail] => ...`).
  - Detects unreachable arms after wildcard patterns.
* **Ergonomic Friction (LOW):**
  - Match is fully functional. Destructuring object patterns (`{ name, age } => ...`) are not yet implemented.

### 2.8 Modules, Imports & Exports
* **Syntax:**
  - Bare import: `import math`
  - Named import: `import { sqrt, PI } from "math"`
  - Default import: `import math from "std.math"`
  - File-relative import: `import { Helper } from "./utils.hkd"`
  - Export: `export fn calculate() { ... }`, `export struct Config { ... }`
* **Usability & Semantics:**
  - Multi-file projects resolve dependencies recursively.
  - Standalone packages from `.hkd/deps` and `vendor` resolve automatically.
  - Standard library modules resolve both bare (`import json`) and prefixed (`import std.json`).
* **Ergonomic Friction (MEDIUM):**
  - Wildcard imports (`import * as mod from "..."`) are not supported.
  - Circular imports across local files require careful declaration ordering to avoid partially initialized exports during phase 1 execution.

### 2.9 Error Handling: `std.result` & Panics
* **Syntax & Utilities:**
  - `result.ok(val)` creates an `Ok` result (`{ __type__: "Result", is_ok: true, is_err: false, value: val, error: null }`).
  - `result.err(e)` creates an `Err` result (`{ __type__: "Result", is_ok: false, is_err: true, value: null, error: e }`).
  - `result.is_ok(r)`, `result.is_err(r)`, `result.unwrap(r)`, `result.unwrap_or(r, fallback)`, `result.map(r, fn)`, `result.map_err(r, fn)`, `result.and_then(r, fn)`.
  - Built-in `panic(msg)` terminates execution with an unrecoverable stack trace.
* **Ergonomic Friction (MEDIUM):**
  - No `?` try operator (e.g. `let val = do_something()?;`). Developers must write explicit `if (result.is_err(res)) { return res }` checks.
  - `Result.unwrap()` throws a runtime `VmError` with code `E405`, which is safe and catchable, but produces multi-line diagnostic noise if not expected.

### 2.10 Concurrency, Async & HTTP
* **Syntax & Utilities:**
  - `std.task.sleep(ms)`: Timer execution.
  - `std.http.get(host, port, path)`, `std.http.post(host, port, path, body)`, `std.http.serve(port)`, `std.http.metrics()`.
* **Usability & Semantics:**
  - HTTP client and server APIs function synchronously and predictably in scripts and services.
* **Status of RFC-004 (`async`/`await`):**
  - Proposed and reserved for Edition 2027. Currently synchronous state machines are simulated or run via callbacks.

### 2.11 Traits & Behavioural Polymorphism
* **Status of RFC-003 (`traits`):**
  - Proposed and reserved for Edition 2027.
  - In Edition 2026, functions take structs as explicit first arguments.

### 2.12 Developer Tooling & Diagnostics
* **CLI:** `hkd run`, `hkd build`, `hkd test`, `hkd fmt`, `hkd lint`, `hkd check`, `hkd init`, `hkd doctor`, `hkd explain`.
* **Diagnostics:** Error spans, line/column tracking, color highlighting, E301 identifier suggestions, E303 structural type mismatch diffs.
* **LSP & DAP:** Full Language Server Protocol (`hkd lsp`) and Debug Adapter Protocol (`hkd dap`) built into the distribution.

---

## 3. Ergonomics Deficit Summary Matrix

| Category | Issue / Friction Point | Severity | Phase 3 Opportunity |
| :--- | :--- | :--- | :--- |
| **Structs** | No `{ field }` shorthand when key matches variable | **MEDIUM** | Candidate for parser & AST enhancement |
| **Structs** | Missing required field validation at struct init | **HIGH** | Candidate for semantic analyser validation |
| **Structs** | Absence of struct methods (`obj.method()`) | **HIGH** | Produce RFC & Lowering Architecture Proposal (`docs/rfc-methods-proposal.md`) |
| **Collections** | Free-function stdlib calls rather than chained helpers | **MEDIUM** | Audit stdlib collection chaining patterns |
| **Errors** | Absence of `?` propagation operator | **MEDIUM** | Document Result pattern best practices |
| **Strings** | Absence of string interpolation | **LOW** | Promote `std.string.format` ergonomics |
| **Async** | RFC-004 async/await in proposed state | **INFORMATIONAL** | Deliver comprehensive status document (`docs/rfc-004-status.md`) |
| **Traits** | RFC-003 traits in proposed state | **INFORMATIONAL** | Deliver comprehensive status document (`docs/rfc-003-status.md`) |

---

## 4. Next Step: Real-World Dogfooding

To validate these findings under actual developer conditions, Phase 3 proceeds immediately to dogfooding four distinct HKD programs:
1. **CLI Utility** (`examples/dogfood/cli_analyzer/`)
2. **HTTP API Service** (`examples/dogfood/http_api/`)
3. **Data Processing Pipeline** (`examples/dogfood/data_pipeline/`)
4. **Multi-File Modular App** (`examples/dogfood/multi_file_app/`)
