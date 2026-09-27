# HKD Standalone Distribution Strategy

This document evaluates packaging and distribution options for compiling HKD into standalone executable binaries (`hkd.exe` on Windows, `hkd` on Linux/macOS) and describes the selected strategy.

---

## 1. Evaluation of Standalone Distribution Strategies

We evaluated four main architectural approaches to distribute HKD as a standalone binary:

### A. Node.js Single Executable Applications (SEA)
- **Mechanism**: Bundles JS code into a single file, compiles it to a binary blob (`.blob`) using Node's built-in experimental configuration builder, and injects it into a copy of the Node.js binary.
- **Startup Overhead**: Identical to Node.js startup time (~90-100ms).
- **Executable Size**: ~40-70 MB (size of the Node.js runtime).
- **Windows / Linux / macOS Compatibility**: Fully supported out-of-the-box natively by Node.js.
- **Maintenance Cost**: Extremely low, standard built-in feature of Node.js.

### B. Vercel Pkg (Community / Bundled Packagers)
- **Mechanism**: Compiles the Node.js application into a self-contained executable with a virtual filesystem layer.
- **Startup Overhead**: Slightly higher than SEA due to the virtual filesystem routing layer.
- **Executable Size**: ~40-60 MB.
- **Maintenance Cost**: Medium-high. Pkg is officially deprecated by Vercel, making future Node.js version compatibility risky.

### C. Bundled Runtime + Native Script Launcher
- **Mechanism**: Delivers a zip archive containing the compiled JS files, a minimal Node.js binary in a subdirectory, and a small launcher script/binary that invokes Node on the entry point.
- **Startup Overhead**: High (incurs both launcher startup and Node.js startup).
- **Executable Size**: ~45-75 MB.
- **Maintenance Cost**: High. Requires compiling and maintaining a custom platform-specific native launcher code.

### D. Native Rewrite (Zig / Rust / C++)
- **Mechanism**: Complete rewrite of the compiler and VM into a native language.
- **Startup Overhead**: Ultra-low (<5ms).
- **Executable Size**: ~1-5 MB.
- **Maintenance Cost**: High upfront engineering, but yields maximum runtime performance.

---

## 2. Quantitative Comparison Matrix

| Option | Startup Latency | Peak RSS Memory | Executable Size | Platform Portability | Codebase Impact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Node.js SEA** | ~90-100ms | ~30-40 MB | ~60 MB | Excellent | None |
| **Pkg** | ~100-115ms | ~35-45 MB | ~50 MB | Low (Deprecated) | None |
| **Bundled Launcher**| ~120-130ms | ~30-40 MB | ~60 MB | High Maintenance| Launcher code |
| **Native Runtime** | **<5ms** | **<5 MB** | **<3 MB** | Excellent | Full VM Rewrite |

---

## 3. Selected Strategy: Node.js SEA (Single Executable Application)

For Phase 2, we select **Node.js SEA (Single Executable Applications)**.

### Rationale
1. **Maintainability**: SEA is natively integrated and supported by Node.js core, ensuring future-proof stability without relying on third-party packaging frameworks.
2. **Correctness**: Zero code changes are required for compiler and VM subsystems.
3. **Distribution**: Yields a clean, single-binary distribution (`hkd.exe`) containing the entire runtime ecosystem.

### Bundler Setup
Since Node.js SEA requires a single standalone JavaScript entry point, we use `esbuild` to compile and bundle the `dist/` compilation artifacts into a single file `dist/bundle.js`, and inject it into the executable.
