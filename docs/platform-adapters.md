# HKD Platform Adapters & Deployment Tier Matrix

This document defines official platform classifications, adapter support levels, and operational guarantees for HKD 1.0.x.

---

## 1. Platform Support Tiers

| Platform / Target | Classification | Runtime Strategy | Container / Binary Support |
|:---|:---|:---|:---|
| **Linux x86_64** | **Tier 1 (Supported)** | Native Zig + JIT | Standalone ELF, Distroless Docker |
| **Linux aarch64** | **Tier 1 (Supported)** | Native Zig + JIT | Standalone ELF, ARM64 Docker |
| **Windows x64** | **Tier 1 (Supported)** | Native Zig + JIT | Standalone Portable `.exe` |
| **macOS Apple Silicon** | **Tier 1 (Supported)** | Native Zig + JIT | Universal Mach-O Binary |
| **Docker / OCI** | **Tier 1 (Supported)** | Minimal Scratch Container | Non-root UID 10001, Multi-stage |
| **Serverless / Vercel** | **EXPERIMENTAL** | Node / Native Shim | Stateless invocation handler |
| **AWS Lambda** | **EXPERIMENTAL** | Custom bootstrap layer | Zip archive deployment |

---

## 2. Production Tier 1 Deployment

### Standalone Binary
HKD compiles down to zero-dependency standalone native binaries:
```bash
hkd build --release --target native
```
The output executable encapsulates the bytecode payload, VM runtime, and standard library, requiring no external Node.js or dynamic dependencies.

### Container Packaging
Production containers generated via `hkd deploy --target docker` utilize:
* Multi-stage compilation isolating source from artifact.
* Minimal runtime footprint (< 15 MB image).
* Non-root user execution (`USER 10001:10001`).
* Read-only root filesystem compatibility.

---

## 3. Serverless & Cloud Adapters (Experimental)

> [!WARNING]
> **Experimental Classification**: Serverless adapters (Vercel, AWS Lambda, Cloudflare) are provided for exploratory serverless workloads. They are not covered by the zero-breaking-change strict SLA of Tier 1 targets.

### Vercel Function Adapter
The Vercel adapter translates HKD request handlers into Vercel Serverless Function format (`api/index.js` or `.vercel/output`).
* Cold-start initialization invokes the reference runtime or native binary shim.
* Handlers process HTTP requests statelessly.

### AWS Lambda Adapter
Custom runtime bootstrap (`bootstrap`) that polls the Lambda Runtime API and routes events into HKD entry points.
