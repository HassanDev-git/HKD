# HKD Production Security Threat Model

## 1. Threat Landscape & Trust Boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ UNTRUSTED: Source code, Third-Party Packages (.hkdpack)       │
└──────────────────────────────┬───────────────────────────────┘
                               │ SHA-256 Validation / AST Parsing
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ COMPILER: Parser, Type Checker, Bytecode & Native Generator  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Verified Bytecode (.hkdb)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ RUNTIME & JIT: W^X Executable Memory, Stack VM, Zig Runtime │
└──────────────────────────────┬───────────────────────────────┘
                               │ System Calls / I/O
                               ▼
┌──────────────────────────────────────────────────────────────┐
│ HOST SYSTEM: Filesystem, Network Sockets, Subprocesses        │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. Attack Vectors & Mitigations

### 2.1 Package Supply-Chain Poisoning
- **Threat**: Malicious package uploads, typosquatting, dependency tampering.
- **Mitigation**: Pinned cryptographic SHA-256 checksums in `hkd.lock`. Package archive validation in `hkd verify-package`. Hermetic extraction without arbitrary script hooks.

### 2.2 Memory Safety & JIT Exploitation
- **Threat**: Buffer overflows, use-after-free, code injection via writable code pages.
- **Mitigation**: Strict `W^X` memory protection (memory is writable during compilation, then made strictly readable and executable before execution). Intrusive ARC reference counting in native runtime.

### 2.3 Secret Exposure
- **Threat**: Accidental leakage of API keys, passwords, and tokens in crash dumps, logs, or diagnostics.
- **Mitigation**: Automated secret redaction masking any token matching sensitive key patterns to `********`.

### 2.4 Denial of Service (DoS)
- **Threat**: Connection floods, slowloris attacks, payload memory bombs.
- **Mitigation**: Max connection throttling (10,000 default), 10 MB payload limits (HTTP 413 rejection), socket keep-alive deadlines, and graceful connection draining.
