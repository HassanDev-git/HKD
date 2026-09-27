# HKD Phase 8 — Production Systems Runtime & Systems Architecture

This guide details the systems architecture, async execution model, and native systems libraries introduced in **HKD Phase 8**.

---

## 1. Asynchronous Execution & Task Architecture

HKD executes async programs via a decoupled, cooperative scheduler and event-loop abstraction.

### 1.1 Architecture Hierarchy

```text
┌────────────────────────────────────────┐
│               HKD Code                 │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│         Task (Cooperative)             │
│  - ExecutionContext (Stack, Frames, IP)│
│  - State Machine                       │
│  - CancellationToken                   │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│              Scheduler                 │
│  - Ready Queue (Round-Robin)           │
│  - Timer Queue (Deadlines)             │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│             Event Loop                 │
│  - IOCP (Windows)                      │
│  - epoll (Linux)                       │
│  - kqueue (macOS)                      │
└───────────────────┬────────────────────┘
                    │
┌───────────────────▼────────────────────┐
│               OS I/O                   │
└────────────────────────────────────────┘
```

### 1.2 Explicit Task State Transitions

Each task progresses through strictly validated states:

```text
Ready ──> Running ──> Waiting ──> Ready
            │           │
            ├──> Completed
            │           │
            ├──> Failed ─┘
            │
            └──> Cancelled
```

- **`Ready`**: Task is queued and ready for execution.
- **`Running`**: Task is actively executing bytecode inside the VM.
- **`Waiting`**: Task yielded for an I/O operation, timer, or child task.
- **`Completed`**: Task returned a result successfully.
- **`Failed`**: Task raised an unhandled runtime error.
- **`Cancelled`**: Task was cancelled via its `CancellationToken`.

---

## 2. Standard Systems Modules

### 2.1 Buffer (`import buffer`)

The `buffer` module provides fast, contiguous heap-allocated byte storage for networking, binary protocols, and streaming I/O.

```hkd
import buffer

// Create buffer from string
let buf = buffer.from_string("HKD Systems Runtime")
print(buf.len) // 19

// Allocate zero-initialized buffer
let raw = buffer.alloc(1024)
print(raw.len) // 1024
```

### 2.2 Safe Subprocesses (`import process`)

HKD executes child processes strictly using argument vectors. Implicit shell execution is completely forbidden, eliminating shell injection vulnerabilities.

```hkd
import process

let proc = process.run(["node", "-v"])
print(proc.exit_code) // 0
print(proc.stdout)    // v20.x.x
```

### 2.3 HTTP Client & Server (`import http`)

Layered over TCP, the `http` module offers robust HTTP/1.1 client requests and routing server capabilities with enforced header and body limits:

```hkd
import http

// HTTP GET
let resp = http.get("127.0.0.1", 8080, "/api/status")
print(resp.status) // e.g. 200 or 500

// HTTP POST
let post_resp = http.post("127.0.0.1", 8080, "/api/data", "{\"key\":\"value\"}")
print(post_resp.status)
```

### 2.4 Cooperative Sleep & Timers (`import task`)

Tasks can yield and sleep for millisecond durations without blocking other ready tasks:

```hkd
import task

task.sleep(100)
print("Resumed after 100ms")
```

### 2.5 Foreign Function Interface (`import ffi`)

HKD isolates foreign code behind an explicit boundary:

```hkd
import ffi

let lib = ffi.open("kernel32.dll")
print(lib != null) // true
```

---

## 3. Resource Lifecycle Semantics

All system handles (Files, Sockets, Servers, Dynamic Libraries) follow deterministic lifecycle stages:

$$\text{Created} \longrightarrow \text{Active} \longrightarrow \text{Closed} \longrightarrow \text{Released}$$

1. **Created**: Resource is allocated and bounds-checked.
2. **Active**: Resource handle is open and ready for non-blocking I/O.
3. **Closed**: I/O operations are halted and OS descriptors are closed immediately. Subsequent operations safely fail with `FileClosed` / `SocketClosed`.
4. **Released**: Associated memory is reclaimed by the allocator without reference leaks.
