# HKD Containerization & Docker Specification

## 1. Multi-Stage Container Design

HKD utilizes a strictly separated two-stage build process to ensure minimal image size, zero secret leakage, and enhanced security.

```dockerfile
# Stage 1: Build Environment
FROM node:20-alpine AS builder
WORKDIR /app
COPY hkd.toml hkd.lock ./
RUN hkd install --locked
COPY . .
RUN hkd build --profile release --target x86_64-linux

# Stage 2: Hardened Runtime Environment
FROM alpine:3.20 AS runtime
RUN addgroup -S hkd && adduser -S hkd -G hkd
WORKDIR /app
COPY --from=builder --chown=hkd:hkd /app/target/release/app /app/server
USER hkd
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/app/server"]
```

---

## 2. Security Invariants

1. **Non-Root Execution**: Container processes run exclusively under non-privileged UID `hkd`.
2. **Minimal Surface Area**: Build tools (Node.js, TypeScript, Zig compiler) and source code are entirely discarded in Stage 1 and never leak into Stage 2.
3. **Deterministic Image Generation**: File timestamps and permissions are normalized.
4. **Read-Only Rootfs Compatible**: The native executable requires only `/tmp` scratch space if temporary files are created.
