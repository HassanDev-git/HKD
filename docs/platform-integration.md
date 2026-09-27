# HKD Platform Integration Matrix

## 1. Verified Support Status

HKD provides an explicit platform support matrix without claiming unverified capabilities:

| Target Platform | Tier | Status | Deployment Method |
| :--- | :--- | :--- | :--- |
| **Linux Bare Metal / VM** | Tier 1 | **SUPPORTED** | Standalone native binary + Systemd unit |
| **Docker / Containerd / K8s** | Tier 1 | **SUPPORTED** | Non-root multi-stage OCI image |
| **GitHub Actions** | Tier 1 | **SUPPORTED** | Automated matrix testing & release workflows |
| **Windows Server** | Tier 1 | **SUPPORTED** | Standalone PE executable (`.exe`) + Windows Service wrapper |
| **macOS Server** | Tier 1 | **SUPPORTED** | Universal Mach-O binary (`aarch64` / `x86_64`) |
| **Vercel / Next.js Serverless** | Tier 2 | **EXPERIMENTAL** | Serverless Node.js bridge adapter (`/api` handler) |
| **AWS Lambda** | Tier 2 | **EXPERIMENTAL** | Custom runtime bootstrap (`provided.al2023`) |
| **Cloudflare Workers (V8 Edge)** | Tier 3 | **NOT SUPPORTED** | Requires Wasm/JS compilation tier |

---

## 2. Platform Adapter Architecture

All platform deployments utilize the `PlatformAdapter` contract:
```typescript
export interface PlatformAdapter {
  readonly id: string;
  readonly name: string;
  detect(): Promise<boolean>;
  validate(projectDir: string): Promise<ValidationResult>;
  build(projectDir: string, options: BuildOptions): Promise<Artifact>;
  package(projectDir: string, artifact: Artifact): Promise<PackageResult>;
}
```
This isolates platform specifics from the core compiler and runtime.
