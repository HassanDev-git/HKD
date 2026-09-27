# HKD Package Security Model

## 1. Threat Model & Principles

Modern package managers represent one of the most critical security boundaries in software engineering. HKD enforces defensive defaults at every layer:

1. **No Automatic Lifecycle Scripts**: Unlike other runtimes, HKD NEVER executes pre-install, post-install, or setup scripts automatically. Package code is completely inert until explicitly imported and executed.
2. **Deterministic Checksum Verification**: Every package archive is cryptographically verified against SHA-256 digests in `hkd.lock` before unpacking.
3. **No Shell Invocations on Metadata**: The package manager never spawns shell interpreters using raw package names, versions, or author metadata.
4. **Strict Path Sanitization**: All incoming package names and archive file paths are strictly vetted against path traversal and directory escape attempts.

---

## 2. Attack Vectors & Defenses

| Attack Vector | Vulnerability | HKD Defense Mechanism |
| :--- | :--- | :--- |
| **Path Traversal** | `../../etc/passwd` or `C:\boot.ini` | Strict `assertSafePath` rejection (`error[SEC005]`) |
| **Symlink Escape** | Symlink pointing to root filesystem | `assertNoSymlinkEscape` checks real paths (`error[SEC007]`) |
| **Archive Zip-Bomb** | Billions of zero-bytes or 100K files | Capped at 5,000 files / 50 MB / depth 16 (`error[SEC003]`) |
| **Dependency Confusion** | Public registry overrides private pkg | Local path dependencies always take precedence over registry |
| **Tampered Lockfile** | Altered URL or version in lockfile | `--locked` / `hkd ci` validates lockfile consistency |
| **Typo-squatting** | `HTTP` vs `http`, `hkd-http` | Strict lowercase ASCII alphanumeric normalization |
| **Immutability Bypass**| Overwriting an existing package tag | Registry enforces 409 Conflict on re-publication (`error[REG009]`) |

---

## 3. Auditing Tooling

Developers and CI systems can audit project security via:

```bash
hkd audit
```

or programmatically:

```bash
hkd audit --json
```

This audits:
* Lockfile integrity and SHA-256 format correctness
* Missing or out-of-sync dependencies
* Package tampering in `.hkd/deps/`
* Discrepancies between lockfile and installed package manifests
