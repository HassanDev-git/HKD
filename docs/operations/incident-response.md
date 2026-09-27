# HKD Operations: Production Incident Response Runbook

## Overview

This runbook defines the emergency operational procedure for responding to production incidents involving HKD services, compiler toolchains, or package infrastructure.

---

## 1. Incident Severity Classification

| Tier | Severity | Definition | Target MTTA | Target MTTR |
|---|---|---|---|---|
| **SEV-1** | **Critical** | Production service total outage, data loss, remote code execution, or package registry compromise. | **< 15 Mins** | **< 2 Hours** |
| **SEV-2** | **High** | Critical service degradation, intermittent runtime crashes, memory leak requiring frequent restarts. | **< 30 Mins** | **< 6 Hours** |
| **SEV-3** | **Medium** | Non-critical feature failure, slow response times, build failure affecting specific edge cases. | **< 2 Hours** | **< 24 Hours** |
| **SEV-4** | **Low** | Minor documentation error, cosmetic CLI formatting glitch, non-blocking warning. | **< 1 Business Day** | Next Sprint |

---

## 2. Emergency Incident Workflow

```
[Detection] ──> [Alert & SEV Assignment] ──> [Containment / Traffic Shift]
                                                    │
[Post-Mortem & Prevention] <── [Recovery Validation] <── [Hotfix / Rollback]
```

### Phase 1: Triage & Containment
1. **Declare Incident**: Establish command bridge and assign Incident Commander (IC).
2. **Determine Failure Domain**:
   - Runtime Crash / OOM → Check `dmesg`, container exit codes, memory soak profile.
   - Network / Connection Starvation → Inspect active connection metrics on `/metrics`.
   - Bad Deployment → Execute immediate rollback (see `docs/operations/rollback.md`).
3. **Isolate Workload**: Shift traffic away from degraded instances using load balancer health checks (`/health` probe).

### Phase 2: Diagnostics Collection
Collect essential telemetry without modifying state:
```bash
# Dump effective runtime configuration (secrets automatically masked)
hkd config --json > /var/log/hkd-incident-config.json

# Dump runtime system diagnostics
hkd runtime-info --json > /var/log/hkd-incident-runtime.json

# Verify artifact integrity of running binary
hkd verify-artifact /app > /var/log/hkd-incident-verify.json
```

### Phase 3: Mitigation & Root Cause Analysis (RCA)
1. **Apply Approved Mitigation**: Hotfix patch release or rollback to last certified release.
2. **Verify Stability**: Assert `/health` and `/ready` return HTTP 200 for 15 consecutive minutes under load.
3. **Blameless Post-Mortem**: Publish RCA within 48 hours detailing timeline, trigger, root cause, and automated test regression additions.
