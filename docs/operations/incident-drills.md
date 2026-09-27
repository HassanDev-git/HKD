# HKD Production Incident Drills & Failure Runbooks

This document outlines simulated failure drills and operational procedures for maintaining HKD 1.0.x in production environments.

---

## Drill 1: Corrupted Package Archive (Integrity Hash Mismatch)

### Incident Scenario
A downloaded or cached `.hkdpack` archive suffers bit-flip corruption or man-in-the-middle tampering in transit.

### Detection
The package manager calculates the SHA-256 hash of the archive and detects that it does not match the locked integrity digest in `hkd.lock`.
* Diagnostic Code: `ErrorCode.E603`
* Message: `Archive integrity mismatch: expected sha256:... received sha256:...`

### Mitigation & Recovery
1. Purge corrupted archive from content-addressed cache:
   ```bash
   rm -rf ~/.hkd/cache/corrupted-pkg-1.0.0.hkdpack
   ```
2. Force re-download with integrity re-verification:
   ```bash
   hkd install --force
   ```
3. If corruption originated from a mirror, temporarily switch to the primary registry:
   ```bash
   export HKD_REGISTRY_URL="https://registry.hkdlang.org/api/v1"
   ```

---

## Drill 2: Upstream Registry Outage / Air-Gapped Mode

### Incident Scenario
The remote package registry is unreachable due to network outage, DNS failure, or deployment within an air-gapped CI/CD VPC.

### Detection
Network requests to `/api/v1/packages/...` time out.

### Mitigation & Recovery
1. Run in offline mode using the local content-addressed cache:
   ```bash
   hkd install --offline
   ```
2. For mission-critical repositories, vendor all dependencies directly into source control:
   ```bash
   hkd vendor
   ```
   Committing the `vendor/` directory eliminates all network dependencies during builds.

---

## Drill 3: Rogue or Vulnerable Dependency Revocation

### Incident Scenario
A security vulnerability is discovered in an external library (`vulnerable-lib@1.0.0`).

### Procedure
1. Run security audit across the project:
   ```bash
   hkd audit
   ```
2. Update the manifest to constrain to patched version:
   ```toml
   [dependencies]
   vulnerable-lib = "^1.0.1"
   ```
3. Update and re-lock:
   ```bash
   hkd update vulnerable-lib
   ```
4. Verify no critical issues remain:
   ```bash
   hkd audit --strict
   ```

---

## Drill 4: Incompatible Native Binary or Corrupted Cache

### Incident Scenario
A host OS update changes C library ABIs or the `.hkd/` build cache contains stale artifacts.

### Mitigation & Recovery
1. Run diagnostics to assess environment:
   ```bash
   hkd doctor
   ```
2. Clean all build outputs and cached bytecode:
   ```bash
   hkd clean
   ```
3. Rebuild native artifacts:
   ```bash
   hkd build --release
   ```
4. Run self-tests:
   ```bash
   hkd test
   ```
