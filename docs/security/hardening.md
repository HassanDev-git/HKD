# HKD Production Runtime Hardening Guide

## 1. System Invariants
1. **Always run as non-root**:
   - HKD containers and systemd services run under dedicated user `hkd` (UID 10001).
2. **Enable W^X JIT Memory Protection**:
   - The native optimizing JIT strictly isolates memory write permissions from execution permissions.
3. **Use Locked Dependencies in Production**:
   - Always run `hkd install --locked` or `hkd ci` in build environments to verify cryptographic lockfile consistency.
4. **Redact Sensitive Environment Variables**:
   - Ensure secrets are stored in secure vaults or environment files excluded from containers via `.dockerignore`.
