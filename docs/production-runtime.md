# HKD Production Runtime Specification

## 1. Production Mode Execution

When executed with `--production` or `HKD_ENV=production`:
- Verbose debug assertions and trace logs are disabled.
- Structured JSON logging is enabled by default.
- Signal interception traps are registered for `SIGINT` and `SIGTERM`.
- Resource and connection quotas are strictly enforced.
- Secrets detected in environment configurations or log parameters are automatically redacted.

---

## 2. Graceful Shutdown Protocol

Upon receiving `SIGTERM` or `SIGINT`:
1. **Quiesce Listener**: Stop accepting new TCP/HTTP connections on all open listeners.
2. **Drain In-Flight Requests**: Allow active requests to complete up to a configurable shutdown deadline (default: 5,000ms).
3. **Cancel Pending Tasks**: Terminate long-polling or queued background tasks.
4. **Flush I/O Buffers**: Flush all pending structured log records and file streams.
5. **Release Sockets & Descriptors**: Close all socket handles and native file descriptors.
6. **Exit**: Exit cleanly with standardized code `0`.

---

## 3. Exit Code Standard

HKD implements standard exit codes across the compiler, runtime, and deployment tools:

| Code | Meaning | Example |
| :--- | :--- | :--- |
| `0` | Success | Clean termination, tests passed, artifact verified |
| `1` | Runtime / Application Error | Unhandled panic, exception in user code |
| `2` | CLI Usage / Argument Error | Invalid flag, missing required parameter |
| `3` | Configuration / Environment Error | Missing mandatory config key, invalid type |
| `4` | Dependency / Build Error | Lockfile mismatch, compilation error, resolver failure |
| `5` | Deployment / Validation Error | Healthcheck failed, pre-flight check error |
