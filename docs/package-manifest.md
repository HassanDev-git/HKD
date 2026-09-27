# HKD Package Manifest Specification

The `hkd.toml` manifest file defines the configuration, metadata, and dependencies of an HKD project.

---

## 1. Syntax

The manifest is written in TOML (Tom's Obvious Minimal Language). The parser supports sections, key-value pairs (strings, booleans, arrays, integers), and inline tables for detailed dependency specs.

---

## 2. Structure

### The `[package]` Section
This section defines the metadata of the current package/project.

* **`name`** (string, required): The name of the package. Must contain only alphanumeric characters, dashes, and underscores.
* **`version`** (string, required): The semantic version (e.g., `"0.1.0"`).
* **`edition`** (string, optional): The HKD language edition/year (e.g., `"2026"`).
* **`main`** (string, optional): The main entry point file. Defaults to `"src/main.hkd"`.
* **`author`** (string, optional): The package author.
* **`license`** (string, optional): The package software license (e.g., `"MIT"`).

Example:
```toml
[package]
name = "my-project"
version = "0.1.0"
edition = "2026"
main = "src/main.hkd"
```

### The `[dependencies]` Section
Defines runtime dependencies. Dependencies can be declared in two formats:

1. **Version Constraint (String)**:
   ```toml
   [dependencies]
   http = "1.0.0"
   ```
2. **Local Path Dependency (Inline Table)**:
   ```toml
   [dependencies]
   mylib = { path = "../mylib" }
   ```

### The `[devDependencies]` Section
Defines build/development-only dependencies. Same structure as `[dependencies]`.

---

## 3. SemVer Constraints

HKD package manager enforces Semantic Versioning 2.0.0:
* `"1.2.3"`: Matches exactly version `1.2.3`.
* `"^1.2.3"`: Matches compatible versions according to semver (any version `>= 1.2.3` and `< 2.0.0`).
* `"latest"`: Matches the latest version available in cache.
