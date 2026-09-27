# HKD Language Editions Specification

## 1. Concept of Language Editions
Language Editions allow the HKD language to evolve its syntax, grammar, and standard idioms over multi-year cycles without fragmenting the ecosystem or breaking existing codebases.

Every project declares its target edition in `hkd.toml`:
```toml
edition = "2026"
```

---

## 2. Edition 2026 (Canonical 1.0.0 Baseline)
- **Status**: FROZEN & STABLE.
- **Key Characteristics**:
  - Full support for `let`, `const`, `fn`, `struct`, `type`, `import`, `export`, `test`, `assert`.
  - Canonical standard library modules (`math`, `str`, `array`, `json`, `env`, `http`, `process`, `task`).
  - Strict left-to-right evaluation order.
  - Standardized exit codes (`0`–`5`).
  - Lockfile V2 determinism.

---

## 3. Migration to Future Editions
When a future edition (e.g. Edition 2029) is introduced:
1. `hkd migrate` will automatically rewrite deprecated idioms and update the edition field in `hkd.toml`.
2. Packages from Edition 2026 will interoperate seamlessly with packages from newer editions in the same workspace.
