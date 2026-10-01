# HKD Developer Preview — Quick Start Guide

Welcome to the **HKD Developer Preview**!

This guide is designed for developers getting started with HKD for the first time. Follow these 8 easy steps to set up your environment, write your first program, and explore the toolchain.

---

## Step 1: Download & Verify

1. Download the latest release for your platform from GitHub Releases:
   - **Windows**: `hkd.exe` (or ZIP)
   - **Linux / macOS**: `hkd` (or tarball)
2. (Optional) Verify the SHA256 checksum:
   ```powershell
   Get-FileHash hkd.exe -Algorithm SHA256
   ```
   Compare the result with `SHA256SUMS` published on the release page.

---

## Step 2: Set Up Your PATH

To use `hkd` conveniently from anywhere in your terminal:
- **Windows**:
  1. Move `hkd.exe` into a folder of your choice (e.g., `C:\tools\hkd\`).
  2. Search for "Environment Variables" in Windows Start.
  3. Under User Variables, edit `Path` and append `C:\tools\hkd\`.
  4. Open a new PowerShell window and run:
     ```powershell
     hkd version
     ```
- **macOS / Linux**:
  ```bash
  chmod +x hkd
  sudo mv hkd /usr/local/bin/hkd
  hkd version
  ```

---

## Step 3: Run Environment Health Check

Run `hkd doctor` to inspect your toolchain, dependencies, and environment:

```bash
hkd doctor
```

Output:
```text
HKD Environment & Toolchain Diagnostics

  ✓ HKD CLI:         v1.1.0 (Installed)
  ✓ Runtime Engine:  Native Register VM + TypeScript Reference VM
  ✓ Memory Limit:    Configured
  ✓ Target Triple:   x86_64-pc-windows-msvc

✓ All systems operational! Ready to build.
```

---

## Step 4: Create Your First Project

Initialize a new project using `hkd init`:

```bash
hkd init my-first-app
cd my-first-app
```

This scaffolds a complete, self-contained project:
- `hkd.toml`: Project configuration and dependencies.
- `src/main.hkd`: Main program entry point.
- `tests/main.test.hkd`: Starter automated tests.
- `README.md`: Project documentation.

---

## Step 5: Explore the Code

Open `src/main.hkd` in your favorite editor:

```hkd
import env

fn greet(name: String) -> String {
    return "Hello, " + name + "! Welcome to HKD."
}

fn main() {
    let message = greet("Developer")
    print(message)
}

main()
```

---

## Step 6: Build, Run, and Test

HKD provides single-command workflows:

### Type-Check
Verify syntax and types without producing output files:
```bash
hkd check
```

### Run
Compile and run instantly:
```bash
hkd run
```

### Build
Produce an optimized bytecode build:
```bash
hkd build --release
```

### Test
Execute project tests:
```bash
hkd test
```

---

## Step 7: Code Quality (Fmt & Lint)

Keep your codebase clean and uniform:

- **Format Code**:
  ```bash
  hkd fmt -w
  ```
- **Lint & Auto-Fix**:
  ```bash
  hkd lint src/main.hkd --fix
  ```
- **Explain Error Codes**:
  If you ever encounter an error code like `E201`, get an instant explanation:
  ```bash
  hkd explain E201
  ```

---

## Step 8: Getting Help & Reporting Issues

- View command help at any time:
  ```bash
  hkd help
  hkd help run
  hkd help build
  ```
- If you find a bug or have a suggestion, open an issue on GitHub using our bug report template:
  [GitHub Issues](https://github.com/HassanDev-git/HKD/issues)

Happy coding with HKD!
