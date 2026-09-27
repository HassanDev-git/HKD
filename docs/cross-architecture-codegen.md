# HKD Phase 11 — Cross-Architecture Codegen & ARM64 Backend Evaluation

## 1. Architecture-Independent MIR Lowering Pipeline

To support heterogeneous execution targets (x86_64, aarch64/ARM64, and WebAssembly) without duplicating optimization logic, HKD separates the compiler pipeline into two cleanly decoupled halves:

```text
       HKD Source Code
             │
             ▼
        HIR / SSA MIR
             │
    ┌────────┴──────────────────────────┐
    │ Architecture-Independent Passes:   │
    │  - Constant Folding & DCE          │
    │  - Copy Propagation & CSE          │
    │  - LICM & Strength Reduction       │
    │  - Escape Analysis & SROA          │
    │  - Controlled Function Inlining    │
    │  - Branch Ordering & Hot Layout    │
    │  - Linear Scan Register Allocator  │
    └────────┬──────────────────────────┘
             ▼
      Lowered LIR / Machine IR
             │
     ┌───────┴───────────────┐
     │ Target-Specific Emit  │
     ├───┬───────────────┬───┤
     ▼   ▼               ▼   ▼
  x86_64                 ARM64 (Apple Silicon / Linux)
```

---

## 2. ARM64 (AArch64) Calling Convention & Register Architecture

### 2.1 Register Mapping Comparison

| Purpose | x86_64 (SysV / Windows) | ARM64 (AAPCS64 / Apple Silicon) |
| :--- | :--- | :--- |
| **Return Value** | `RAX` | `X0` |
| **Argument 1** | `RDI` (SysV) / `RCX` (Win) | `X0` |
| **Argument 2** | `RSI` (SysV) / `RDX` (Win) | `X1` |
| **Argument 3** | `RDX` (SysV) / `R8` (Win) | `X2` |
| **Argument 4** | `RCX` (SysV) / `R9` (Win) | `X3` |
| **Frame Pointer** | `RBP` | `X29` (FP) |
| **Link Register** | Stack / `[RSP]` | `X30` (LR) |
| **Stack Pointer** | `RSP` | `SP` (16-byte aligned) |
| **Vector / Float** | `XMM0` - `XMM15` | `V0` - `V31` (128-bit NEON) |

### 2.2 ARM64 Fixed-Length 32-bit Instruction Encoding

Unlike x86_64 which has variable-length instruction encodings (1 to 15 bytes), ARM64 uses fixed 4-byte (32-bit) instruction words:

```nasm
; Function Prologue
stp     x29, x30, [sp, -16]!    ; Push FP and LR onto stack, adjust SP
mov     x29, sp                 ; Set new frame pointer

; Binary Addition (x0 = x0 + x1)
add     x0, x0, x1              ; 32-bit opcode: 0x8b010000

; Function Epilogue & Return
ldp     x29, x30, [sp], 16      ; Restore FP and LR
ret                             ; Jump to LR (0xd65f03c0)
```

---

## 3. Cross-Platform Compilation Verification

The native runtime verifies clean cross-compilation using Zig's cross-compilation toolchain:
- **x86_64-linux**: Native ReleaseFast binary with ELF formatting
- **aarch64-macos**: Native ReleaseFast binary targeting Apple Silicon M-series
- **x86_64-windows**: PE/COFF standalone binaries with structured exception handling
