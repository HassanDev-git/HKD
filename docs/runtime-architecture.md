# HKD Runtime Architecture Specification

This document defines the architecture, layers, and platform abstractions for the HKD native execution layer.

---

## 1. Execution Stack & Layers

To ensure security, performance, and portability, the HKD environment is organized into five decoupled layers:

```text
┌─────────────────────────────────────────────────────────┐
│                    Language Primitives                  │
│  (Expressions, Syntax, gradual types, control structures)│
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Compiler Pipeline                    │
│   (Lexer, Pratt Parser, Semantic Analyser, Bytecode)   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                    Bytecode Format                      │
│        (Serialized .hkdb bytecode & constants)          │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                     Runtime Engine                      │
│     (Stack VM, event poller, scheduler, memory)         │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                Platform Abstraction Layer               │
│     (Timers, Filesystem, Sockets, Processes, OS)       │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Platform Abstraction Layer (PAL)

To prevent coupling language semantics directly to Windows-specific or Linux-specific APIs, the Zig runtime implements a unified platform abstraction layer.

### A. Filesystem Abstraction
- Streaming file readers/writers to process huge files in chunks.
- Portable paths: Uniform path separators (convert Windows backslashes internally to forward slashes).

### B. Socket Networking Abstraction
- Async sockets backed by the operating system's native polling mechanism.
- Common TCP listener/client APIs.

### C. Process & Environment Abstraction
- Safe subprocess spawning using argument vectors, bypassing system shell injection vulnerabilities.
- Standard I/O streams wrapping OS handles.

### D. Concurrency & Event Loop Abstraction
- Non-blocking scheduler operating an event loop.
- Cross-platform event polling (IOCP on Windows, epoll on Linux, kqueue on macOS).
