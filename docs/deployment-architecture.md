# HKD Deployment Architecture

## 1. Overview

HKD Phase 14 establishes a comprehensive, production-grade deployment and runtime pipeline. It transitions HKD from a compiler and virtual machine into a complete, deployable platform capable of generating self-contained native release artifacts, hardened multi-stage containers, and deterministic cloud deployment packages.

```text
                         HKD Source Tree
                               │
                        hkd.toml (Manifest)
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
      Compiler Pipeline               Package Subsystem
        - Lexer/Parser                  - SemVer 2.0
        - SSA / Optimizer               - Resolver 2.0
        - Bytecode / JIT / AOT          - Content Cache
               │                               │
               └───────────────┬───────────────┘
                               ▼
                       Build Engine
               (debug, release, size, speed, release-pgo)
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
  Standalone Native      Container Image       Deployment Bundle
  (AOT Executable)      (Multi-Stage Docker)   (Systemd / Platform)
        │                      │                      │
        ▼                      ▼                      ▼
   Bare Metal / VM       Docker / K8s           Cloud / Linux Server
```

---

## 2. Core Pillars

1. **Deterministic Build Profiles**: Standardized profiles (`debug`, `release`, `size`, `speed`, `release-pgo`) governing compiler optimizations, debug symbol inclusion, and inlining thresholds.
2. **Canonical Target Triples**: Consistent representation of execution targets (`arch-os-abi`), validating cross-compilation support before invoking codegen.
3. **Standalone Native Distribution**: Packaging native Zig runtime with compiled `.hkdb` bytecode into single-file native executables with trailing metadata, requiring zero Node.js or external dependencies in production.
4. **Supply Chain Integrity**: Every build artifact is accompanied by a SHA-256 checksum, a `build-manifest.json`, and a standards-compliant CycloneDX 1.5 JSON Software Bill of Materials (SBOM).
5. **Production Hardened HTTP & Networking**: Industrial-grade HTTP server with connection throttling, request limits, keep-alive management, structured metrics, and graceful shutdown signal handlers (`SIGINT`/`SIGTERM`).
6. **Containerization**: Deterministic generation of multi-stage Dockerfiles executing with a non-root user, read-only rootfs compatibility, and zero build secrets in the runtime layer.
7. **Platform Integration**: Explicit, verified platform adapters for generic Linux servers, containerized workloads, GitHub Actions CI/CD, and serverless bridges.
