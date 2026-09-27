# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

---

## Reporting a Vulnerability

We take the security and integrity of the HKD programming language ecosystem seriously.

If you identify a potential security vulnerability in HKD (compiler, native runtime, package manager, or standard library), please do NOT report it in public issue trackers.

### Reporting Channels
Please disclose vulnerabilities through one of the following private channels:
1. **GitHub Security Advisory**: Use GitHub's private vulnerability reporting feature on the official repository.
2. **Direct Security Contact**: Email `hassnk.dev@gmail.com` with encrypted PGP details if available.

### Disclosure Information
Please provide:
1. Subsystem affected (e.g. Stack VM, parser, package manager archive unpacker, HTTP server).
2. Minimal reproduction steps, proof-of-concept code, or malformed artifact fixture.
3. Observed versus expected impact (e.g. denial of service, memory corruption, path traversal).

### Responsible Disclosure Process
- Maintainers review reports on a best-effort, priority basis.
- Fixes are developed in private forks, verified against regression test suites, and issued through official patch releases.
- Vulnerability reporters will be credited in the release notes and advisory disclosures upon coordination.
