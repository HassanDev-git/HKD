# Getting Started with HKD

Welcome to HKD (v1.1.0), a high-performance, statically typed, systems programming language featuring deterministic memory management, zero-cost abstractions, first-class structured concurrency, and a unified developer ecosystem.

---

## 1. System Requirements & Installation

### Requirements
- **Node.js**: v18.0.0 or later (for TypeScript tooling & CLI orchestrator)
- **Host OS**: Windows (x64), Linux (x86_64, aarch64), or macOS (arm64, x86_64)
- **Optional**: Zig 0.13+ (only if compiling the standalone native C/Zig runtime from source)

### Installation
Clone the repository and build the TypeScript distribution:

```bash
git clone https://github.com/HassanDev-git/HKD.git
cd HKD
npm install
npm run build
```

Link the `hkd` binary globally or add `./dist/cli/main.js` to your PATH:

```bash
npm link
# Or run directly via node:
node /path/to/HKD/dist/cli/main.js --version
```

Verify your installation:

```bash
hkd doctor
hkd version
```

---

## 2. Your First Project: 60 Seconds to "Hello, World!"

HKD provides an end-to-end zero-friction workflow for creating, running, testing, formatting, and compiling projects.

### Step 1: Initialize
Create a new project folder:

```bash
hkd init my-app
cd my-app
```

This generates the standard HKD project layout:
```text
my-app/
├── hkd.toml          # Project manifest & metadata
├── src/
│   └── main.hkd      # Application entrypoint
└── tests/
    └── main.test.hkd # Built-in test suite
```

### Step 2: Run
Execute your project immediately:

```bash
hkd run
```

Output:
```text
✓ Compiled 1 module(s) (debug build)
Hello from my-app!
```

### Step 3: Run Tests
Execute the built-in test runner:

```bash
hkd test
```

Output:
```text
HKD Test Runner

tests/main.test.hkd
  ✓ basic math works (1ms)

────────────────────────────────────────
  1 passed  (1 total)
```

### Step 4: Format Source Code
Ensure your code follows idiomatic HKD formatting conventions:

```bash
hkd fmt
```

You can also verify formatting in CI without writing changes:

```bash
hkd fmt --check
```

### Step 5: Type-Check
Verify type correctness and semantic constraints without code generation:

```bash
hkd check
```

### Step 6: Build for Production
Produce an optimized production release build:

```bash
hkd build --release
```

---

## 3. Project Configuration (`hkd.toml`)

Every project has an `hkd.toml` manifest:

```toml
name = "my-app"
version = "0.1.0"
edition = "2026" # Or "2027" for async/await features
description = "High-performance data processor"
author = "Your Name <you@example.com>"
license = "MIT"
main = "src/main.hkd"

[dependencies]
# Dependencies added via `hkd add` appear here:
# math-utils = "^1.0.0"
# local-helper = { path = "../local-helper" }

[devDependencies]
```

---

## 4. Next Steps
- Read [CLI Reference](cli-reference.md) for all available commands.
- Read [Package Guide](package-guide.md) to learn how to add, lock, and publish packages.
- Read [Debugging Guide](debugging-guide.md) to learn how to inspect and debug programs with DAP.
