# HKD WebAssembly (WASM) Architecture & Feasibility Study

- **Target Platforms**: `wasm32-unknown-unknown` (Browser/Edge Sandbox), `wasm32-wasi` (Wasmtime/Wasmer Serverless)
- **Status**: Research & Feasibility Specification (Phase 18 Milestone)
- **Target Release**: HKD 1.2 / 1.3
- **Classification**: Platform Evolution & Architecture Roadmap

---

## 1. Executive Summary

As HKD matures with first-class parametric polymorphism, pattern matching, and functional standard library combinators, running HKD programs in zero-trust sandboxes, edge runtimes (Cloudflare Workers, Fastly Compute), and browser-based developer playgrounds becomes a primary strategic requirement.

This study analyzes the technical feasibility of targeting WebAssembly (`wasm32`), evaluates direct bytecode-to-WASM translation versus MIR lowering, specifies the object memory and garbage collection models, defines the Host ABI / WASI interface, and establishes a phased delivery roadmap.

---

## 2. Compilation Strategy & Pipeline

HKD's existing compiler pipeline consists of:
```
Source Code (.hkd)
       │
       ▼
Lexer & Parser
       │
       ▼
AST (Nodes with Edition 2027 & #feature flags)
       │
       ▼
Semantic Analyser (Type resolution, Generics, Pattern Exhaustiveness)
       ├───► HIR (High-Level Intermediate Representation)
       │       │
       │       ▼
       │     MIR (SSA-form Low-Level IR, Escape Analysis, Dead-Code Elimination)
       │       ├───► Native AOT (Zig/LLVM backend -> x86_64, aarch64)
       │       └───► WASM AOT (wasm32 binary emitter)
       ▼
Bytecode Compiler (HKDB V2 Stack VM)
       └───► WASM Bytecode VM (Zig runtime compiled to wasm32-wasi)
```

Two distinct compilation paths are viable:

### Approach A: WASM-Compiled Native Runtime (Tier 3 Immediate)
Compile HKD's native Zig runtime and stack VM directly to `wasm32-wasi` using `zig build -Dtarget=wasm32-wasi`.
* **Advantages**: Zero compiler backend modifications; runs existing `.hkdb` chunks directly; 100% bytecode compatibility; immediate availability.
* **Overhead**: Moderate runtime binary footprint (~1.2 MB WASM module including VM and allocator).

### Approach B: Direct AOT Lowering from MIR to WASM (Tier 2 Target)
Lower SSA MIR directly into WASM binary sections (`code`, `type`, `function`, `memory`, `export`).
* **Advantages**: Zero interpreter overhead; near-native execution speed; tiny binary sizes for small utilities (10 KB – 50 KB).
* **Complexity**: Requires mapping HKD dynamic types and closures to WASM types.

---

## 3. Bytecode to WASM Instruction Mapping

Because HKD's VM is a stack machine, many HKDB V2 opcodes map 1:1 to WASM stack operations:

| HKDB V2 Opcode | Operands | WASM Instruction | Description |
|----------------|----------|------------------|-------------|
| `Op.LoadConst` | `index: u16` | `i32.const <val>` / `i64.const` | Push constant value |
| `Op.LoadNull` | None | `i32.const 0` | Push null representation |
| `Op.LoadTrue` | None | `i32.const 1` | Push boolean true |
| `Op.LoadFalse` | None | `i32.const 0` | Push boolean false |
| `Op.Pop` | None | `drop` | Discard top of stack |
| `Op.Add` | None | `i64.add` / `f64.add` | Numeric addition |
| `Op.Sub` | None | `i64.sub` / `f64.sub` | Numeric subtraction |
| `Op.Mul` | None | `i64.mul` / `f64.mul` | Numeric multiplication |
| `Op.Div` | None | `i64.div_s` / `f64.div` | Numeric division |
| `Op.Eq` | None | `i64.eq` / `f64.eq` | Equality comparison |
| `Op.Lt` | None | `i64.lt_s` / `f64.lt` | Less-than comparison |
| `Op.Jump` | `offset: i16` | `br <label>` | Unconditional branch |
| `Op.JumpFalse` | `offset: i16` | `i32.eqz` + `br_if <label>` | Branch if falsy |
| `Op.Call` | `argc: u8` | `call $func` / `call_indirect` | Call static/dynamic function |
| `Op.Return` | None | `return` | Return from function |

---

## 4. Memory Model & Garbage Collection

### 4.1 Linear Memory with Two-Space Copying Collector
In initial `wasm32` deployments, HKD will utilize linear memory (`(memory 1)`) with a compact Cheney two-space copying garbage collector:
* **Object Layout**:
  ```
  +------------------+------------------+-----------------------+
  | Header (4 bytes) | Size (4 bytes)   | Payload / Field Slots |
  +------------------+------------------+-----------------------+
  ```
* **Tagged Pointers**:
  - Lowest 3 bits encode tag: `000` = Heap Object pointer, `001` = Fixnum (31-bit integer), `010` = Boolean, `011` = Null/Special.
* **Allocator**: Fast bump-pointer allocation in the active semi-space. Collection triggers when threshold is reached, copying live objects to to-space.

### 4.2 WebAssembly GC Proposal (WasmGC)
As WasmGC (`ref.struct`, `ref.array`, `ref.cast`) reaches universal browser availability (Chrome 119+, Firefox 120+, Safari 17.4+), HKD can optionally target native host garbage collection:
* Structs lower directly to `(type $User (struct (field (mut anyref))))`.
* Arrays lower to `(type $Array (array (mut anyref)))`.
* Eliminates the bundled garbage collector and enables direct interop with JavaScript V8/SpiderMonkey GC.

---

## 5. Host ABI & WASI Integration

### 5.1 WASI Syscalls (`wasm32-wasi`)
When running under WASI (Wasmtime, Node.js `--experimental-wasi-unstable-preview1`):
* `fd_write`: Used by `std.io.print` and `std.io.eprint` for stdout/stderr streaming.
* `clock_time_get`: Used by `std.time.now` and `std.time.now_secs`.
* `random_get`: Used by `std.random`.
* `environ_get` / `environ_sizes_get`: Used by `std.env.get`.

### 5.2 Browser / JS Interop (`wasm32-unknown-unknown`)
When embedded directly inside a web browser:
```javascript
// JavaScript host embedding example
const response = await fetch("app.wasm");
const { instance } = await WebAssembly.instantiateStreaming(response, {
  hkd_host: {
    print: (ptr, len) => console.log(decodeString(ptr, len)),
    eprint: (ptr, len) => console.error(decodeString(ptr, len)),
    now: () => Date.now(),
  }
});

// Run HKD main entrypoint
const exitCode = instance.exports.hkd_main();
```

---

## 6. Standard Library Tier Compatibility Matrix in WASM

| Stdlib Module | `wasm32-wasi` Support | `wasm32-unknown` (Browser) Support | Notes |
|---------------|-----------------------|-----------------------------------|-------|
| `math` | 100% | 100% | Pure mathematical computation |
| `string` | 100% | 100% | UTF-8 string manipulation |
| `array` | 100% | 100% | Full functional iterators (find, reduce, etc.) |
| `result` | 100% | 100% | Full RFC-005 Result combinators |
| `json` | 100% | 100% | Pure serialization/parsing |
| `time` | 100% | 100% | Backed by `clock_time_get` / `performance.now` |
| `random` | 100% | 100% | Backed by `random_get` / `crypto.getRandomValues` |
| `io` | 100% | Stderr/Stdout mapped | Stdin disabled in browser environment |
| `fs` | Virtual/Pre-opened | In-memory VFS only | Sandboxed filesystem |
| `http` | Restricted | Mapped to `fetch()` API | Raw TCP sockets not permitted |
| `process` | Exit code only | Disabled | Spawning child OS processes prohibited |
| `ffi` | Disabled | Mapped to WebAssembly imports | Dynamic native `.so`/`.dll` unavailable |

---

## 7. Implementation Roadmap

1. **Phase 18 (Completed)**: Architectural feasibility analysis, opcode mapping matrix, stdlib capability classification, documentation.
2. **HKD 1.2 (Target)**: Build target `hkd build --target wasm32-wasi` utilizing the Zig native runtime compiled to WASM. Automated CI tests running under Wasmtime.
3. **HKD 1.3 (Target)**: Browser runtime bundle (`@hkd/wasm-runtime`), interactive web playground, and direct MIR-to-WASM AOT compiler backend.
