# HKD Security Boundaries & Execution Isolation

**Target Scope**: HKD 1.1.0 Platform  
**Status**: Formal Architectural Specification  

---

## 1. Trust Boundaries

HKD establishes distinct security boundaries across execution tiers:

```text
┌─────────────────────────────────────────────────────────┐
│                    Host Environment                     │
│  (Host OS, Filesystem, Process Environment, Networking) │
└────────────────────────────┬────────────────────────────┘
                             │ System Calls / I/O APIs
┌────────────────────────────▼────────────────────────────┐
│              Standard Library Platform Layer            │
│         (std.io, std.fs, std.http, std.process)         │
└────────────────────────────┬────────────────────────────┘
                             │ Capability Gating
┌────────────────────────────▼────────────────────────────┐
│                    HKD Virtual Machine                  │
│       (Stack VM / Native Zig Runtime / JIT Compiler)     │
├─────────────────────────────────────────────────────────┤
│            Guest HKD Code Execution Sandbox             │
│            (Stack, Heap, Closures, Objects)             │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Boundary Controls

### 2.1 Memory Isolation
- Guest HKD code cannot dereference arbitrary raw memory pointers directly.
- All array lookups are bounds-checked in the VM (`Op.GetIndex`, `Op.SetIndex`).
- All object and struct field accesses are resolved through string or offset dispatch maps.

### 2.2 Native Code & JIT Boundaries
- The Baseline and Optimizing JIT emit machine code into memory pages marked `PAGE_EXECUTE_READ` (or W^X equivalent).
- Code emission occurs into a dedicated code buffer; once written, buffers are sealed before branch execution.
- If native compilation encounters unsupported constructs or edge conditions, it immediately bails out to the Stack VM reference interpreter without crashing.

### 2.3 Container & Deployment Boundaries
- Docker container images generated via `hkd container init` enforce non-root user execution (`USER 10001:10001`).
- Default working directories are isolated in `/app`.
- Read-only root filesystems and dropped capabilities (`drop: ALL`) are recommended in production deployment configurations.
