# HKD 1.0.0 Migration Guide

## 1. Upgrading from Pre-1.0 Codebases
HKD 1.0.0 introduces automated migration tooling via the CLI:

```bash
hkd migrate [--dry-run]
```

### What `hkd migrate` Does:
1. **Manifest Upgrades (`hkd.toml`)**:
   - Ensures `edition = "2026"` is specified.
   - Upgrades legacy configuration sections to modern 1.0 standards.
2. **Lockfile V1 to V2 Migration (`hkd.lock`)**:
   - Converts legacy lockfiles to the deterministic TOML format with explicit SHA-256 source pinning.
3. **Safety Backups**:
   - Creates `.bak` backup copies before writing changes.
4. **Dry-Run Inspection**:
   - Running with `--dry-run` displays planned changes without touching the filesystem.
