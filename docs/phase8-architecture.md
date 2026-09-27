# HKD Production Systems Runtime & Async Architecture Spec

This document details the authoritative architectural design for the asynchronous systems runtime, event loop backends, TCP/UDP networking, streaming filesystem, subprocess execution, native FFI, and resource lifecycles in the HKD native execution layer.

---

## 1. Async Runtime & Scheduler Architecture

HKD utilizes a cooperative asynchronous task scheduling model:

```text
               ┌────────────────────────┐
               │    HKD VM bytecode     │
               └───────────┬────────────┘
                           │ yields on I/O / yield()
                           ▼
               ┌────────────────────────┐
               │  Coroutine Scheduler   │
               └───────────┬────────────┘
                           │ polls
                           ▼
               ┌────────────────────────┐
               │       Event Loop       │
               └───────────┬────────────┘
                           │ monitors
                           ▼
        ┌──────────────────────────────────────┐
        │     Platform Abstraction Layer       │
        │  (IOCP / epoll / kqueue / select)    │
        └──────────────────────────────────────┘
```

### Threading & Extensibility
- **Single-Threaded Core**: The initial scheduler/event loop runs on a single thread to minimize lock overhead and ensure correctness.
- **Future-Proof Extensibility**: The scheduler is designed with clean task queues to facilitate future additions of background worker threads, CPU-bound thread pools, and task work-stealing without modifying execution contexts or bytecode.

### Execution Context & Task Model
A `Task` is decoupled from the virtual machine state using an `ExecutionContext` abstraction:
- **VM Stack State**: Reference to the thread/coroutine local value stack slice.
- **CallFrame State**: Call stack tracking execution frame pointers.
- **Instruction Pointer (IP)**: Execution cursor.
- **Task States**:
  - `Ready`: Waiting in the scheduler run-queue.
  - `Running`: Actively executing.
  - `Waiting`: Blocked on an I/O event, timer, or future.
  - `Completed`: Task execution succeeded.
  - `Failed`: Encountered an error.
  - `Cancelled`: Terminated early.
- **Cancellation State**: Pointer to a `CancellationToken` to trigger early termination.

---

## 2. Platform-Independent Event Loop

The event loop implements a platform-independent interface to avoid leaking OS-specific handles:

- **Windows**: Backed by **I/O Completion Ports (IOCP)**. Sockets, pipes, and file descriptors are bound to a completion port, with events retrieved via `GetQueuedCompletionStatus`.
- **Linux**: Backed by **epoll**. Sockets are monitored via `epoll_wait`.
- **macOS / BSD**: Backed by **kqueue**. Uses `kevent` to register and retrieve events.

Timers and wakeups are integrated directly into the loop to avoid busy waiting or polling loops that waste CPU cycles.

---

## 3. Layered Networking & HTTP Architecture

To prevent HTTP or high-level application logic from coupling to raw socket details, networking is structured into explicit decoupled layers:

```text
  HKD Application / API
           │
           ▼
     HTTP Client/Server
           │
           ▼
    TCP / UDP Socket
           │
           ▼
     Event Loop / PAL
           │
           ▼
   Operating System I/O
```

### Socket Capability
- **TCP**: Supports non-blocking `connect`, `listen`, `accept`, `read`, `write`, `close`, and `shutdown`. Handles partial reads, writes, and connection resets gracefully.
- **UDP**: Non-blocking `bind`, `send`, and `receive` with timeout support.

### HTTP Abstractions
- **Request / Response**: Features proper abstractions mapping status codes, headers, and query parameters.
- **Streaming & Keep-Alive**: Designed for streaming request/response bodies and connection reuse.
- **Backpressure**: Enforces socket read/write limits to prevent slow clients from causing unbounded buffering or memory growth.

---

## 4. Streaming Filesystem & Binary Buffers

### Binary Buffer (`Buffer`)
- Contiguous allocated memory block backing socket/file I/O.
- Exposes methods for safe integer/float encoding, UTF-8 conversions, resizes, appends, and slices.
- Explicit lifecycle and allocator management.

### Filesystem 2.0 (`fs`)
- Operations operate on `Buffer` chunks.
- Avoids loading entire file contents into memory by using chunk-by-chunk stream processing.

---

## 5. Subprocess Execution & FFI

### Subprocesses
- Securely executes processes using explicit argument vectors (`process.run(["git", "status"])`).
- Never invokes a system shell implicitly, eliminating command injection vulnerabilities.

### Foreign Function Interface (FFI)
- Formally defines an `unsafe extern` boundary for loading libraries, looking up symbols, and invoking C ABIs.
- Protects the VM: malformed signature checks fail with controlled runtime VM exceptions rather than native segmentation faults.

---

## 6. Unified Resource Management

Every native resource follows a strict, predictable lifecycle:

```text
    Created  ──►  Active  ──►  Closed / Cancelled  ──►  Released
```

### Resource Types
- `Socket`, `File`, `Process`, `Timer`, `Task`, `Buffer`, `DynamicLibrary`, `HTTPConnection`.

### Resource Safety
- **No Resource Leaks**: Double closing a handle is safely ignored or returns a controlled error.
- **Reference Counting Integration**: Associated heap values integrate with the runtime's manual reference counting (`retain`/`release`) to ensure native memory is freed as soon as resources are closed and released.
