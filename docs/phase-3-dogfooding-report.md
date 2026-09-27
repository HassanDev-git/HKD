# HKD Phase 3 — Real-World Dogfooding Report

**Date:** September 2026  
**Auditor:** Lead Compiler Engineer, Runtime Engineer & QA Auditor  
**HKD Version:** 1.1.0 (Editions: 2026 Default, 2027 Opt-In)  
**Execution Environment:** Windows x64, Node.js v24, Native Zig VM (hkd-runtime.exe) & TypeScript Reference VM  

---

## 1. Executive Summary

In Phase 3, we dogfooded the HKD programming language by constructing and executing **four complete real-world programs** from scratch:
1. **Project A (CLI Utility):** Directory Analyzer & File Inspector (`examples/dogfood/cli_analyzer/`)
2. **Project B (HTTP Service):** REST API Service with JSON endpoints (`examples/dogfood/http_api/`)
3. **Project C (Data Processing):** CSV/JSON ETL Transformation Pipeline (`examples/dogfood/data_pipeline/`)
4. **Project D (Multi-File App):** Modular E-Commerce Checkout Engine (`examples/dogfood/multi_file_app/`)

Dogfooding under realistic developer workflows proved extraordinarily effective. While simple hello-world programs and isolated unit tests passed, running actual idiomatic developer programs immediately exposed **two critical release-blocking compiler bugs**, **two high-severity diagnostic/runtime discrepancies**, and **multiple high-impact ergonomic friction points**.

---

## 2. Dogfooding Project Logs & Real Execution Analysis

### 2.1 Project A — CLI Directory Analyzer (`examples/dogfood/cli_analyzer/`)
* **Objective:** Inspect directories, analyze file statistics, format file sizes, and handle CLI arguments using `std.env`, `std.fs`, `std.path`, `std.string`, and `std.array`.
* **Code Structure:**
  - `main.hkd`: 80 lines. Defines `struct FileStats { total_files: Int, total_dirs: Int, total_size: Int }`.
  - Implements `format_bytes(bytes: Int) -> String`.
  - Scans directories using `fs.list_dir`, `fs.is_dir`, `fs.exists`, `fs.read`.
* **Execution Results:**
  - **Reference VM:** Executed. Discovered CLI argument leak: `env.args()` returned `["run", "--reference", "main.hkd"]` instead of script arguments.
  - **Native VM:** Failed with runtime error: `HKD Runtime Error: Value is not callable` at `let entries = fs.list_dir(target_dir)`.
* **Root Cause:**
  - `native-runtime/src/stdlib.zig` only implemented `fs.exists` and `fs.read`. Methods `list_dir`, `is_dir`, `is_file`, `write`, `append`, `mkdir` existed in the TypeScript stdlib but were missing from the Native Zig VM stdlib.

---

### 2.2 Project B — HTTP REST API Service (`examples/dogfood/http_api/`)
* **Objective:** Implement REST API router with endpoints: `GET /health`, `GET /users`, `GET /users/:id`, `POST /users`. Validate JSON bodies, return 200, 201, 400, 404 responses, and exercise `std.http`, `std.json`, `std.result`.
* **Code Structure:**
  - `server.hkd`: 170 lines.
  - Structs: `User`, `HttpResponse`.
  - Handlers: `handle_health()`, `handle_get_users()`, `handle_get_user_by_id(id: Int)`, `handle_post_user(raw_body: String)`.
  - Dispatch router pattern with error objects.
* **Execution Results:**
  - **Reference VM:** Successfully served all 6 test routes (`/health`, `/users`, `/users/1`, `/users/999`, valid `POST /users`, invalid `POST /users`).
  - **Compiler Diagnostics:** Emitted false `E301: Variable is declared but never used` for variables passed as object literal values.
  - **Native VM:** Failed with `Module not found: examples\dogfood\http_api\result.hkdb`.
* **Root Cause:**
  - In `src/semantic/analyser.ts`, line 675: `case "ObjectExpr": return T_ANY;` never recursed into `field.value`, so any identifier used in an object literal remained unvisited and was falsely flagged as unused.
  - In `native-runtime/src/stdlib.zig`, `resolveStdModule` did not include `result` or `std.result`, causing native runs to search for a local `.hkdb` file.

---

### 2.3 Project C — Data Processing Pipeline (`examples/dogfood/data_pipeline/`)
* **Objective:** Ingest multi-line CSV data, parse records, filter valid/completed transactions, calculate 8% tax, reduce to financial summary, and format pretty JSON.
* **Code Structure:**
  - `pipeline.hkd`: 130 lines.
  - Structs: `Transaction`, `ProcessedTx`, `SummaryReport`.
  - Functional collection methods: `array.map`, `array.filter`, `array.reduce`.
* **Execution Results:**
  - **Reference VM:** Fully processed all records and generated the correct JSON summary:
    ```json
    {
      "count": 4,
      "gross": 6700,
      "tax": 536,
      "net": 7236
    }
    ```
    Emitted 4 false `E301` warnings for `new_count`, `new_gross`, `new_tax`, `new_net` because they were assigned inside object literals.
  - **Native VM:** Failed at `array.map` with `HKD Runtime Error: Value is not callable`.
* **Root Cause:**
  - Native runtime `array` module only implements basic array mutation (`push`, `pop`, `len`, `join`); higher-order functional callbacks (`map`, `filter`, `reduce`) are implemented exclusively in the Reference VM.

---

### 2.4 Project D — Multi-File Modular Application (`examples/dogfood/multi_file_app/`)
* **Objective:** Construct a modular, multi-file application with cross-file struct and function imports:
  - `models.hkd`: Domain models (`Customer`, `Item`, `Order`, `Invoice`).
  - `utils.hkd`: Helpers (`format_currency`, `calculate_discount`, `calculate_sales_tax`).
  - `services.hkd`: Business logic (`create_order`, `process_checkout`, `print_invoice_summary`).
  - `main.hkd`: Main execution pipeline.
* **Execution Results:**
  - **Compilation Failure:** Failed on `main.hkd`:
    ```text
    HKD Error[E308]: Undefined struct `Customer`
    HKD Error[E308]: Undefined struct `Item`
    HKD Error[E301]: Undefined variable `create_order`
    HKD Error[E301]: Undefined variable `process_checkout`
    ```
* **Critical Discovery 1 (BLOCKER — Named Imports):**
  - In `src/semantic/analyser.ts`: `analyseImport` only handled `stmt.defaultName` (`import foo from "bar"`). It **completely ignored `stmt.specifiers`** (`import { a, b } from "bar"`), so named imports were never defined in the symbol table!
  - In `src/bytecode/compiler.ts`: `compileImport` only assigned `stmt.defaultName`. If `stmt.defaultName` was null, it executed `this.emit(Op.Pop)` and discarded the module object, never extracting or declaring the named specifiers!
* **Critical Discovery 2 (BLOCKER — Loop Local Variable Collision):**
  - When writing `for item in order.items { let line_total = ... }`:
    Declaring ANY local variable inside a `for` loop body overwrote the runtime iterator on the VM stack (`IterNext requires an iterator`).
  - Root cause: In `compileFor`, `stmt.variable` was defined at local slot 0, then the iterator was pushed without being allocated a local slot. When the loop body declared its first local variable, `defineLocal` assigned slot 1—which was the exact stack slot occupied by the iterator!

---

## 3. Discovered Issues Classified by Severity

| ID | Issue Description | Location | Severity | Impact |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | `ForStmt` local variable clobbers iterator on VM stack | `src/bytecode/compiler.ts` (`compileFor`) | **BLOCKER** | Any `for` loop containing `let` crashes with `IterNext requires an iterator` after 1st iteration. |
| **BUG-02** | Named imports (`import { a, b } from "mod"`) ignored & discarded | `src/semantic/analyser.ts`, `src/bytecode/compiler.ts` | **BLOCKER** | Developers cannot use named imports; all named imported symbols fail as undefined. |
| **BUG-03** | `ObjectExpr` does not visit field values in semantic analyser | `src/semantic/analyser.ts` (`analyseExpr`) | **HIGH** | False `E301` unused variable warnings whenever variables are used in `{ key: value }`. |
| **GAP-04** | Native Zig VM missing stdlib modules (`result`, `array.map/filter/reduce`) | `native-runtime/src/stdlib.zig` | **HIGH** | Discrepancy between native and reference runtime stdlib APIs. |
| **ERG-05** | No struct / object field initialization shorthand | `src/parser/parser.ts` (`parseObjectFields`) | **MEDIUM** | Requires repetitive `Point { x: x, y: y }` instead of `Point { x, y }`. |
| **ERG-06** | Struct initialization missing required field validation | `src/semantic/analyser.ts` (`analyseStructInit`) | **MEDIUM** | Omitted fields silently evaluate to `null` at runtime instead of compile-time error. |
| **ERG-07** | Absence of struct methods (`obj.method()`) | Language Grammar / AST | **HIGH** | Requires procedural free functions `fn rect_area(r)` instead of `r.area()`. |
| **ERG-08** | `std.env.args()` includes runner CLI parameters | `src/stdlib/index.ts`, `src/cli/main.ts` | **LOW** | `env.args()` returns CLI flags like `["run", "--reference", ...]` instead of script args. |

---

## 4. Usability Fixes Recommended for Immediate Implementation

To dramatically increase developer usability and eliminate these critical blockers, the following targeted fixes are scheduled for immediate implementation in Phase 3:
1. **Fix BUG-01 (Loop Local Collision):** Ensure the loop iterator in `compileFor` occupies a reserved local slot so nested local declarations never clobber the iterator.
2. **Fix BUG-02 (Named Imports):** Support named import specifiers in `analyseImport` and emit `GetField` destructuring in `compileImport`.
3. **Fix BUG-03 (Object Literal Field Visitor):** Recurse into object field values during semantic analysis to eliminate false `E301` unused variable warnings.
4. **Implement ERG-05 (Field Initialization Shorthand):** Allow `{ x, y }` and `User { name, age }` where key matches in-scope identifier.
