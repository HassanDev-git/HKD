# HKD Systems & Runtime Audit - Phase 8.0

This document contains a comprehensive systems-level audit of the HKD Programming Language, analyzing its current architecture, runtime model, I/O boundaries, and systems capabilities to prepare for the Phase 8 Native Systems and Application Runtime implementation.

---

## 1. Current Architecture

HKD consists of a dual-execution architecture:
1. **JS/TS Compiler & Reference VM**: Passes through Lexer -> Parser -> Semantic Analyser -> Bytecode Compiler. The reference VM executes `.hkdb` files in JavaScript/Node.js.
2. **Zig Native Runtime**: A statically compiled, dependency-free virtual machine (`hkd-runtime`) executing the `.hkdb` binary directly.

During a normal run (`hkd run`), the CLI compiles the source file to `.hkdb` in memory or on disk and spawns the native Zig runtime to execute it.

---

## 2. Runtime Model & Limitations

Currently, the HKD execution model is strictly synchronous and blocking:
- **No Event Loop**: Neither the reference VM nor the native Zig VM possesses an asynchronous event-driven loop or scheduler.
- **No Tasks/Concurrency**: Execution follows a single-threaded call stack. There are no abstractions for promises, futures, coroutines, or threads.
- **No Background Tasks**: Long-running operations block the VM's dispatch loop completely.

---

## 3. I/O Model

The current I/O model is synchronous and blocking:
- **Standard I/O**: `print` and `println` write directly to stdout. Stdin and stderr are bound to static blocking operations.
- **Filesystem**: `std.fs` read, write, and append operations are synchronous, wrapping blocking calls from host system APIs (`std.fs.cwd()`).
- **Networking**: No built-in socket or networking support currently exists.

---

## 4. Threading Model

- **Single-Threaded**: The runtime runs on the main thread of the process.
- **No Mutexes/Channels**: Lacks synchronization primitives or message-passing abstractions.
- **Allocator Contention**: The runtime uses a single allocator instance without thread-local caching, meaning multithreading would incur heavy lock contention if introduced without memory isolation.

---

## 5. Module Model

- **Compile-time Scoping**: Module names and paths are resolved relative to the importing file.
- **Static Copying**: When a module is loaded, its top-level definitions are recursively copied into the parent scope context.
- **Static Native Modules**: Native modules (`math`, `string`, `env`, etc.) are hard-coded into the VM's lookup table at startup.

---

## 6. Native Boundary & FFI

- **Static Native Binding**: Currently, native functions must be statically compiled into the Zig runtime and registered as `HkdNativeFn` values.
- **No Dynamic FFI**: There is no capacity to load external shared libraries (`.dll`, `.so`, `.dylib`) dynamically or define external C signatures.
- **ABI Boundaries**: Interfacing with native code is currently limited to passing the VM's internal `Value` slice representation, requiring serialization/deserialization.

---

## 7. Bytecode Boundary

The `.hkdb` bytecode file formats a sequence of instructions and a constant pool:
- Magic bytes: `HKDB` (4 bytes).
- Format and target ABI versions (4 bytes).
- Function/Module name, arity, local variable count, upvalue count.
- Instruction bytes array, line number mapping array (`u16`).
- Constants pool (Null, Boolean, Number, String, Function).

---

## 8. Memory Ownership

- **Reference Counting**: Managed via manual `retain()` and `release()` macros in Zig.
- **Deallocation**: Values are freed recursively when their reference count drops to 0.
- **Cyclic Leak Risk**: The reference counting engine cannot automatically resolve cyclic references, creating memory leak risks for self-referential structures.

---

## 9. Performance Bottlenecks

- **Synchronous Blocking**: Stalling on I/O operations halts the entire VM execution.
- **Direct Heap Allocation**: Small values (strings, arrays) are allocated individually using the standard heap allocator, creating memory fragmentation and allocation overhead.
- **Field Lookup**: Reading and writing structure fields involves runtime string hashing and hash map lookups.

---

## 10. Compatibility Risks

- **OS Specific APIs**: I/O and process abstractions behave differently on Windows (IOCP, `CreateProcess`, backslashes) vs Unix (epoll, kqueue, `fork`, forward slashes).
- **Parity Mismatch**: Introducing complex native scheduling, FFI, or networking risks diverging the behavior of the TS reference VM and the Zig native VM.
