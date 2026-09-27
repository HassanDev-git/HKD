# HKD Operations: Production Rollback Runbook

## Overview

This runbook specifies the zero-downtime rollback procedures for HKD production deployments across containerized and bare-metal environments.

---

## 1. Rollback Trigger Criteria

Initiate immediate rollback if any of the following occur post-deployment:
- HTTP 5xx error rate exceeds 0.5% over a 3-minute sliding window.
- Service fails liveness/readiness probes (`/health` or `/ready`).
- Memory consumption increases monotonically (unbounded RSS leak).
- P99 latency spikes above 200% of baseline SLA.
- Release artifact fails cryptographic verification (`hkd verify-artifact`).

---

## 2. Containerized Rollback (Kubernetes / Docker)

### 2.1 Kubernetes Workloads
```bash
# 1. Inspect revision history
kubectl rollout history deployment/hkd-production-app

# 2. Rollback immediately to previous known-good revision
kubectl rollout undo deployment/hkd-production-app

# 3. Monitor rollback rollout status
kubectl rollout status deployment/hkd-production-app --timeout=60s

# 4. Verify pod health and readiness
kubectl get pods -l app=hkd-production-app
```

### 2.2 Docker Swarm / Standalone Docker
```bash
# 1. Revert service to previous image tag
docker service update --rollback hkd-server-service

# 2. Or if running standalone container:
docker stop hkd-server-current
docker start hkd-server-previous
```

---

## 3. Standalone / Bare-Metal Binary Rollback

For deployments running standalone compiled native binaries:

```bash
# 1. Change active symlink to previous certified release directory
cd /opt/hkd-apps/production-app
ln -sfn releases/production-app-1.0.0-previous current

# 2. Verify artifact integrity before signaling restart
hkd verify-artifact current/

# 3. Gracefully reload service via systemd
sudo systemctl reload-or-restart hkd-app.service

# 4. Confirm process status and port listening
sudo systemctl status hkd-app.service
curl -f http://127.0.0.1:8080/health
```

---

## 4. Post-Rollback Verification Checklist

- [ ] Load balancer reports all targets healthy (`/health` returns `200 OK`).
- [ ] Active connection count stabilizes.
- [ ] Error rates drop back to nominal (< 0.01%).
- [ ] Notify Incident Commander and log event in incident channel.
