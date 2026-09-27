# HKD CI/CD & Automated Pipelines

## 1. Pipeline Stages

Production CI/CD workflows for HKD projects enforce deterministic, reproducible steps:

```text
Lint & Typecheck ──> Test Suite ──> Native Build ──> Artifact Verification ──> Container & Package
```

1. **Dependency Installation**: Guaranteed through `hkd install --locked`, verifying that resolved trees match `hkd.lock` hashes.
2. **Automated Testing**: Runs unit, integration, and security tests across targeted OS runners.
3. **Multi-Platform Matrix**: Parallel execution on `windows-latest`, `ubuntu-latest`, and `macos-latest`.
4. **Reproducibility Checks**: Dual-build comparison proving bit-for-bit equivalence.
5. **Artifact Signing & Hash Manifests**: Generation of `SHA256SUMS` and CycloneDX SBOMs.

---

## 2. Multi-Tier Cache Keys

CI cache keys combine:
- Runner Operating System (`${{ runner.os }}`)
- Compiler toolchain version
- Lockfile cryptographic hash (`${{ hashFiles('**/hkd.lock') }}`)
- Build profile (`release`, `size`, `speed`)
- Native PGO profile hash (if PGO enabled)
