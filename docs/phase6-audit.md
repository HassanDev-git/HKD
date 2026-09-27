# HKD Repository & Performance Audit - Phase 6.0

This document contains a comprehensive audit of the HKD Programming Language compiler, virtual machine, build tools, package manager, and development integrations.

---

## 1. Current Architecture

HKD consists of two main implementations:
1. **TypeScript Reference Environment**:
   - Compiler pipeline: Lexer -> Parser -> Semantic Analyser -> Bytecode Compiler.
   - Reference Virtual Machine: Executes the compiled `.hkdb` bytecode in JavaScript.
   - CLI: Standard commands (`run`, `build`, `test`, `fmt`, `lint`, `check`, `init`, `add`, `remove`, `install`, `update`, `doc`).
2. **Zig Native Runtime**:
   - Written in Zig.
   - Implements a fast, native virtual machine that reads `.hkdb` files and executes them without Node.js overhead.
   - Executable path: `native-runtime/zig-out/bin/hkd-runtime.exe` (or `hkd-runtime`).

When running `hkd run src/main.hkd`, the CLI compiles the source code to `.hkdb` bytecode using the JS compiler and immediately invokes the Zig native runtime to execute it.

---

## 2. Current Bottlenecks

### Compiler Pipelines
* **Parser Allocations**: The parser constructs highly nested AST nodes in JS/TS. Large files lead to substantial GC pressure and compilation overhead.
* **Symbol Lookup**: The semantic analyser performs symbol lookup via linear scope walks, which can become a bottleneck on heavily nested scopes.

### Runtime (Zig VM)
* **Property Lookups**: Object and method properties are resolved via string hash lookup on every access, causing overhead in tight loops.
* **Function Dispatch**: Standard switch dispatch is used. Every instruction decode incurs a switch statement jump table dispatch cost.
* **Allocations**: Values, closures, arrays, objects, and strings are allocated individually. Lack of arena allocation or object pooling for short-lived values contributes to heap fragmentation and runtime overhead.

---

## 3. Current Memory Ownership Model

The Zig VM uses a manual reference counting model (`retain` / `release` helpers) to manage value lifetimes:
* Simple primitives (numbers, booleans, null) are copied by value and require no memory operations.
* Heap-allocated values (Strings, Arrays, Objects, Functions, Closures, Iterators, Upvalues) have a `ref_count` field.
* `retain()` increments the ref count.
* `release()` decrements the ref count. When it hits `0`, the value and any nested heap allocations are freed recursively.
* Temporary allocations (like string concatenation results or temporary array buffers) must be carefully deallocated.

---

## 4. Bytecode Compatibility Model

* Bytecode format: `.hkdb`.
* The file starts with a 8-byte header:
  - Magic: `"HKDB"` (4 bytes)
  - Format/Bytecode version: `u8` (currently `1`)
  - Language major version: `u8`
  - Language minor version: `u8`
  - Runtime ABI: `u8`
* Incompatibility is rejected at startup: if the magic doesn't match or the format version != 1, execution terminates.
* No internal runtime instruction validation occurs before executing, which makes the runtime vulnerable to crashes if corrupted bytecode is executed.

---

## 5. Compiler/Runtime Boundaries

* The boundary is strictly the `.hkdb` binary format.
* The JS/TS compiler writes the binary to `target/debug/` or `target/release/`.
* The native runtime is invoked with the file path as the first CLI argument:
  `hkd-runtime <compiled_file.hkdb>`
* Module imports (`import "lib"`) map to recursive `.hkdb` loading and execution on the VM level.

---

## 6. Cache Invalidation Rules

Incremental compilation uses `target/build-manifest.json` with the following invalidation triggers:
* SHA-256 hash of a file's content differs.
* Target `.hkdb` file does not exist on disk.
* Compiler version mismatch (`HKD_VERSION`).
* Project language edition mismatch in `hkd.toml`.
* Compilation mode mismatch (`--release` vs `--debug`).

---

## 7. Package Resolution Flow

1. Reading dependencies/devDependencies in `hkd.toml`.
2. Walking the dependency tree starting from the root.
3. Detecting cyclic imports (causing immediate build errors).
4. Generating `hkd.lock` mapping exact sources (path or checksum).
5. Copying package directories to `.hkd/deps/` securely (rejecting path traversal attempts).
6. Local path resolution climbing parent directories to locate the `.hkd/deps/` folder.

---

## 8. LSP Architecture

* Standard stdin/stdout JSON-RPC protocol server compiled to `dist/lsp/server.js`.
* Communicates with editors (like VS Code) over standard streams.
* Handles:
  - Document Sync (`textDocument/didOpen`, `textDocument/didChange`).
  - Diagnostics publishing (Lexer, Parser, and Analyser errors).
  - Hovers (`textDocument/hover`).
  - Go to Definition (`textDocument/definition`).

---

## 9. Native Runtime Architecture

* Implemented in Zig.
* Structure:
  - `main.zig`: Bytecode deserialization, module loader, entrypoint.
  - `vm.zig`: Core VM executor, call frames, instruction dispatch, native functions.
  - `value.zig`: Heap values representation, type checks, ref counting.
  - `stdlib.zig`: String/Array prototype methods, standard module cache.
* Single-threaded execution loop.

---

## 10. Known Technical Debt

* **Lack of Bytecode Validation**: The native VM directly decodes and executes bytes. A malformed or malicious jump offset, invalid constant index, or instruction stack underflow can cause segmentation faults or buffer overflows.
* **No Unified Allocation Strategy**: The Zig allocator (`std.heap.smp_allocator`) is called directly for every single object creation, leading to high allocation overhead.
* **Slow Property/Field Resolution**: String matching is performed on every field read/write instead of using inline caching or optimized string hashes.
