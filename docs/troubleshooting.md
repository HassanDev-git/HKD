# HKD Troubleshooting & Diagnostic Guide

This guide outlines common issues, compiler diagnostic messages, runtime errors, and step-by-step resolution workflows for the HKD programming language.

---

## 1. Environment & Installation Diagnostics

### Running `hkd doctor`
Whenever you encounter toolchain issues or path anomalies, run `hkd doctor` first:
```bash
hkd doctor
```
This performs 10 automated health checks:
1. Node.js engine compatibility (>= 18.0.0)
2. Native runtime binary availability (`hkd-runtime.exe` / `hkd-runtime`)
3. Global HKD cache directory permissions (`~/.hkd/cache`)
4. Language Server Protocol (LSP 2.0) components
5. Debug Adapter Protocol (DAP) components
6. Standard library modules registry
7. Project manifest integrity (`hkd.toml` if run in a project root)
8. VS Code extension manifest
9. Security, fuzzing, and audit subsystem
10. Lockfile version and integrity (`hkd.lock`)

---

## 2. Common Compiler Errors

### Error E301: Undefined Variable
**Cause**: The variable was referenced before declaration, misspelled, or out of scope.
**Example**:
```
HKD Error[E301]
  Undefined variable `myVar`
    --> src/main.hkd:12:5
```
**Fix**: Verify variable spelling. HKD provides fuzzy spelling suggestions (`Did you mean ...?`).

### Error E304: Duplicate Variable in Scope
**Cause**: A variable with the same identifier is declared twice in the same block.
**Fix**: Rename the variable or reassign without `let`:
```hkd
let x = 10
x = 20 // Reassignment, not `let x = 20`
```

### Error E307: Arity Mismatch
**Cause**: Calling a function with too few or too many arguments.
**Fix**: Check the function signature in its definition.

### Error E309: Feature Gated by Edition
**Cause**: Using generics, pattern matching, or `async fn` in an Edition 2026 project.
**Example**:
```
HKD Error[E309]
  Feature `generics` is only available in Edition 2027
```
**Fix**: Add `edition = "2027"` to `hkd.toml` under `[package]`.

---

## 3. Package Management & Supply-Chain Issues

### Checksum Mismatch (`error[SEC001]`)
**Cause**: A downloaded `.hkdpack` archive does not match the SHA-256 recorded in `hkd.lock` or the registry.
**Fix**:
1. Check if the package source was modified or corrupted in transit.
2. Clear the local package cache:
   ```bash
   rm -rf ~/.hkd/cache/packages/<corrupted_hash>
   ```
3. Re-run dependency resolution:
   ```bash
   hkd install
   ```

### Path Traversal / Security Limits Rejection (`error[SEC005]`)
**Cause**: An archive contains entries escaping the target directory (e.g. `../../sensitive`).
**Action**: HKD automatically rejects malicious archives. Do not bypass this check.

---

## 4. Runtime Issues

### Native Runtime vs Reference Runtime Discrepancies
If your code relies on high-level reflection, interactive debugger breakpoints, or experimental stdlib extensions not yet compiled into the native Zig binary, execute using the reference VM:
```bash
hkd run --reference src/main.hkd
```
