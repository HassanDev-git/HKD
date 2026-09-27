# HKD Performance Profile - Phase 6.4

This document profiles the runtime performance and hotspots of the HKD Programming Language compiler and the native Zig virtual machine.

---

## 1. Hot Opcode Analysis

Opcode profile for 10,000 loop allocation iterations (Array, Object, String, Loop structures):

```text
Opcode                 Executions
---------------------------------
LoadLocal              60,001
LoadConst              50,003
Pop                    40,004
StoreLocal             20,002
Add                    20,000
Call                   20,001
MakeObject             10,000
GetField               10,000
Jump                   10,000
JumpFalse              10,001
Return                 1
MakeArray              1
Halt                   1
---------------------------------
```

### Analysis of Hot Paths
* **Stack Access**: `LoadLocal` and `LoadConst` dominate, accounting for over **45%** of all instruction dispatches.
* **Variable Assignments**: `StoreLocal` is another major hot spot.
* **Function Calls & Jumps**: Iteration loop controls (`Jump`, `JumpFalse`, and `Call`) are executed heavily.

---

## 2. Dispatch and VM Loops

* The current VM implementation uses a standard `switch` statement on the instruction byte inside a `while (true)` loop.
* At high loop counts (e.g. 1,000,000 iterations), the overhead of checking the switch jump table on every instruction decode becomes measurable.
* Inline readers are implemented for variables and constants which keeps decode times low.

---

## 3. String & Object Allocation Costs

* Every string concatenation (`+` operator / `Add` instruction) allocates a new `HkdString` struct and duplicates the underlying characters slice.
* Objects are constructed dynamically via `MakeObject`, which duplicates string keys in the fields map on creation.
* Field lookups (`GetField`) perform hash map lookups using dynamic keys.
