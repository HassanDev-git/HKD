# HKD Project Inspector (Dogfood Application 4)

A standalone developer utility written in 100% pure HKD that demonstrates real-world tooling capabilities:
- Project manifest inspection (`hkd.toml`)
- Workspace source module discovery
- Line of code (LOC) calculation
- Lockfile presence verification (`hkd.lock`)
- Automated health diagnostic reporting

## Usage

```bash
# Run with reference runtime
hkd run --reference examples/dogfood/project_inspector/main.hkd

# Or compile to bytecode
hkd build examples/dogfood/project_inspector/main.hkd
```

## Output Example

```
Starting HKD Project Inspector...
[inspector] Scanning project root: .
==================================================
          HKD PROJECT INSPECTION REPORT           
==================================================
  Package Name:     "hkd"
  Package Version:  "1.1.0"
  Target Edition:   "2026"
  Source Modules:   1
  Total Lines:      12
  Lockfile Present: true
  Health Status:    HEALTHY
==================================================
Project inspection finished successfully.
```
