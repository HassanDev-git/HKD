# HKD Platform Support Tier Matrix

- **Specification Version**: 1.1.0
- **Language Edition**: 2026 / 2027
- **Last Updated**: 2026-09-04

---

## 1. Overview of Platform Tiers

HKD establishes three strict tiers of platform support to ensure transparent reliability, reproducible builds, and predictable deployment targets across production enterprise infrastructure, cloud edge nodes, and developer workstations.

```
       ┌─────────────────────────────────────────────────────────────┐
       │                          TIER 1                             │
       │  Guaranteed Support • Full CI on Every Commit • Releases   │
       │  x86_64-linux • x86_64-windows • aarch64-macos             │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
       ┌──────────────────────────────▼──────────────────────────────┐
       │                          TIER 2                             │
       │  Guaranteed Build • Nightly & Release CI • Stdlib Validated │
       │  aarch64-linux • x86_64-macos • aarch64-windows             │
       └──────────────────────────────┬──────────────────────────────┘
                                      │
       ┌──────────────────────────────▼──────────────────────────────┐
       │                          TIER 3                             │
       │  Experimental • Community Maintained • Milestone Validated  │
       │  wasm32-wasi • wasm32-browser • riscv64-linux • armv7       │
       └─────────────────────────────────────────────────────────────┘
```

---

## 2. Platform Tier Definitions

### Tier 1: Guaranteed Support
* **CI Validation**: Every pull request, commit, and release artifact is built and tested across all unit, integration, conformance, and fuzzing test suites.
* **Release Artifacts**: Official precompiled native binaries, Docker containers, and `.hkdpack` archives are produced and cryptographically signed.
* **Compatibility Guarantee**: Breaking regressions are treated as P0 release blockers.
* **Component Coverage**: Full compiler, Stack VM, Baseline JIT, Optimizing JIT, AOT native backend, LSP 2.0, DAP debugger, and standard library.

### Tier 2: Guaranteed Build & Stdlib
* **CI Validation**: Automated verification on merge to `main` and release tags.
* **Release Artifacts**: Official release tarballs and wheels provided.
* **Compatibility Guarantee**: Regressions are prioritized and resolved within patch releases.
* **Component Coverage**: Compiler, VM, AOT native backend, standard library (JIT where hardware architecture is supported).

### Tier 3: Experimental & Milestone
* **CI Validation**: Buildability and basic conformance verified during milestone releases.
* **Release Artifacts**: Built from source or community-contributed container images.
* **Compatibility Guarantee**: Best-effort; breaking changes may occur across minor releases as underlying platform standards evolve.

---

## 3. Platform Support Matrix

| Target Triple | Tier | Architecture | Operating System | JIT Support | AOT Support | Stdlib Status | Container Support |
|---------------|------|--------------|------------------|-------------|-------------|---------------|-------------------|
| `x86_64-unknown-linux-gnu` | **Tier 1** | x86_64 | Linux (glibc 2.27+) | Yes (Baseline & Opt) | Yes (ELF) | 100% Full | `hkd/runtime:latest` |
| `x86_64-pc-windows-msvc` | **Tier 1** | x86_64 | Windows 10/11 / Server 2019+ | Yes (Baseline & Opt) | Yes (PE/COFF) | 100% Full | Windows Nano / WSL2 |
| `aarch64-apple-darwin` | **Tier 1** | Apple Silicon (M1+) | macOS 12+ (Monterey+) | Yes (ARM64 JIT) | Yes (Mach-O) | 100% Full | Native Host |
| `aarch64-unknown-linux-gnu` | **Tier 2** | ARM64 | Linux (glibc 2.27+ / musl) | Yes (ARM64 JIT) | Yes (ELF) | 100% Full | `hkd/runtime:arm64` |
| `x86_64-apple-darwin` | **Tier 2** | Intel x86_64 | macOS 11+ (Big Sur+) | Yes (Baseline) | Yes (Mach-O) | 100% Full | Native Host |
| `aarch64-pc-windows-msvc` | **Tier 2** | ARM64 | Windows 11 on ARM | In progress | Yes (PE/COFF) | 100% Full | WSL2 ARM64 |
| `wasm32-wasi` | **Tier 3** | WebAssembly 32-bit | WASI Preview 1 (Wasmtime/Wasmer) | N/A (WASM Engine) | Planned (MIR) | Sandboxed (VFS) | Wasm OCI |
| `wasm32-unknown-unknown` | **Tier 3** | WebAssembly 32-bit | Browser / JS Sandboxes | N/A | Planned (MIR) | Pure Algorithmic | N/A |
| `riscv64gc-unknown-linux-gnu` | **Tier 3** | RISC-V 64-bit | Linux (glibc 2.33+) | VM Only | Planned | Core Stdlib | QEMU / Docker |
| `armv7-unknown-linux-gnueabihf` | **Tier 3** | ARMv7-A (32-bit) | Linux (glibc 2.28+) | VM Only | Planned | Core Stdlib | Raspberry Pi OS |

---

## 4. Minimum Host Requirements

### Runtime Execution Requirements
* **Memory**: Minimum 64 MB RAM (12 MB typical resident set size for basic scripts).
* **Disk Space**: 15 MB for standalone runtime; 45 MB for full toolchain (`hkd`, standard library, package cache).
* **Operating Systems**:
  - Linux: Kernel 4.18+, glibc 2.27+ or musl 1.2+
  - Windows: Windows 10 Version 1909+ or Windows Server 2019+
  - macOS: macOS 11 (Big Sur) or higher

### Toolchain Build Dependencies
* **Node.js**: `v18.0.0` or higher (LTS recommended)
* **TypeScript**: `v5.0.0`+
* **Zig**: `0.11.0` or `0.12.0` (for native runtime and AOT compiler backends)
* **LLVM** (Optional for AOT advanced optimizations): `16.0`+

---

## 5. Subsystem Platform Compatibility

| Subsystem | Linux | Windows | macOS | WASI / WASM |
|-----------|-------|---------|-------|-------------|
| Compiler & Parser | Full | Full | Full | Full |
| Stack VM Interpreter | Full | Full | Full | Full |
| JIT Compiler | Full | Full | Full (ARM64/x86) | N/A |
| Native AOT Compilation | Full | Full | Full | Roadmap 1.3 |
| Package Manager (`hkd pack`, `hkd add`) | Full | Full | Full | Read-only Cache |
| Language Server (`hkd lsp`) | Full | Full | Full | Browser LSP (VFS) |
| Debug Adapter (`hkd dap`) | Full | Full | Full | In planning |
| `std.fs` (Filesystem) | Native POSIX | Win32 API | Native POSIX | WASI VFS |
| `std.http` (Networking) | POSIX Sockets | Winsock2 | POSIX Sockets | fetch / host |
| `std.process` (Subprocesses) | `fork`/`exec` | `CreateProcess` | `fork`/`exec` | Disabled |
| `std.ffi` (C ABI Bindings) | `libdl` / ELF | `LoadLibrary` | `libdl` / Mach-O | WASM Imports |

---

## 6. Deprecation and Tier Transition Policy

* **Promoting a Platform**: Moving a platform from Tier 2 to Tier 1 requires 90 consecutive days of green CI builds, automated release publishing, and at least two maintainers responsible for architecture-specific bugs.
* **Demoting a Platform**: A platform is never demoted without a formal RFC approved by the HKD Core Team and an advance notice period of at least one minor release cycle.
