# HKD RFC-003: Traits & Static Polymorphism — Implementation Plan

**Date:** September 2026  
**Status:** In Progress / Pre-Implementation Audit Complete  
**Target Edition:** Edition 2027 (gated behind `edition = "2027"` or `#feature(traits)`)  
**Baseline Edition:** Edition 2026 (Unchanged, default, frozen)  

---

## 1. Executive & Architectural Summary

RFC-003 introduces **Behavioural Contracts & Traits** to HKD for Edition 2027. The core philosophy of this implementation is **compile-time static polymorphism**:
* Zero dynamic dispatch overhead (no runtime reflection, no dictionary passing, no heap-allocated fat pointers/trait objects in initial release).
* Unified method resolution model that integrates directly with Phase 4 struct methods.
* Strict compile-time coherence, signature verification, and trait bound checking.
* 100% preservation of Edition 2026 backward compatibility and zero modifications to VM opcodes.

---

## 2. Subsystem Audit & Readiness Matrix

| Subsystem | Current State | Missing Pieces / Required Changes | Impact Level |
|---|---|---|---|
| **Lexer** | `TokenKind.Impl` exists; `TokenKind.Trait` absent | Add `TokenKind.Trait = "trait"`, register in `KEYWORDS` and `isKeyword`. | Low |
| **AST** | `ImplBlockStmt` exists (struct only) | Add `TraitDeclStmt`, `TraitMethodDecl`. Update `ImplBlockStmt` with optional `traitName`. Support `T: Bound` in `TypeParamDecl`. | Medium |
| **Parser** | Parses `impl Struct { ... }` | Add `parseTraitDecl()`. Update `parseImpl()` to support `impl Trait for Struct { ... }`. Update `parseTypeParams()` for `T: Trait`. Add Edition 2026 gating (`E201`). | Medium |
| **Semantic Analyser** | Inherent struct methods & assign checks | Add `TraitDef`, trait registry, impl coherence checks, method signature parity checking (`E307`, `E303`, `E308`), generic trait bound checking. | High |
| **Type System** | Struct, Function, Primitives | Add trait bound to `TypeParamType`. Verify assignability/conformance of structs to traits. | Medium |
| **Bytecode Compiler** | Static lowering for struct methods | Lower trait methods implemented on structs as `${Struct}__${method}`. Lower trait-bounded generic functions via compile-time specialization/monomorphization. | Medium |
| **Stack VM / Native VM** | Tagged value execution | ZERO changes required. Bytecode remains standard opcodes (`Op.Call`, `Op.LoadGlobal`). | None |
| **JIT / AOT** | Compiles standard opcodes | ZERO changes required. Standard static calls are optimized identically to Phase 4 methods. | None |
| **LSP** | Struct method completion & hover | Add `trait` keyword completion, trait member completion, hover for trait methods, go-to-definition for trait declarations. | Medium |
| **DAP** | Standard stack frames | Specialized functions preserve human-readable names (`fn__Struct`). | Low |
| **Formatter** | Formats `impl Struct` | Support formatting `trait TraitName { ... }` and `impl Trait for Struct { ... }`. | Low |
| **Modules** | Named import/export of structs/functions | Support exporting and importing `trait` declarations across modules. | Low |
| **Release Gates** | 18/18 PASS | Keep 18/18 PASS; RFC-003 remains experimental/2027 gate. | None |

---

## 3. Semantic Model & Grammar Specifications

### 3.1 Trait Declaration
```hkd
trait Printable {
    fn print(self) -> String
}
```
Rules:
- Methods in a trait do not have bodies (RFC-003 initial minimal design). Default methods are intentionally excluded.
- The first parameter must be `self` (`E307`).
- Method names within a trait must be unique (`E304`).
- Edition 2026 usage produces `E201: Traits are an experimental feature in HKD. Enable with #feature(traits) or set edition = "2027" in hkd.toml`.

### 3.2 Trait Implementation
```hkd
impl Printable for User {
    fn print(self) -> String {
        return self.name
    }
}
```
Rules:
- The trait `Printable` must exist in scope (`E301`).
- The struct `User` must exist in scope (`E301`).
- Duplicate implementations of `impl Trait for Struct` are rejected (`E304`).
- All required methods in `Printable` must be implemented (`E308`).
- Implemented method signatures must match the trait declaration:
  - Parameter count must match (`E307`).
  - Parameter types must match (`E303`).
  - Return type must match (`E303`).
- Implemented methods become accessible on instances of `User` as `user.print()`.

### 3.3 Trait Bounds on Generics
```hkd
fn display<T: Printable>(value: T) -> String {
    return value.print()
}
```
Rules:
- When analyzing `display`:
  - `T` is recognized as a type parameter with bound `Printable`.
  - Inside `display`, expressions of type `T` can invoke any method declared in `Printable`.
- When calling `display(arg)`:
  - If `arg` is of type `User`, the analyser checks if `User` implements `Printable`.
  - If not, emit `E308: Type 'X' does not implement trait 'Printable'`.

---

## 4. Lowering & Dispatch Strategy

1. **Concrete Struct Method Lowering:**
   Methods declared in `impl Trait for Struct` are compiled identically to inherent methods:
   `User__print(user, ...)`.
   When `user.print()` is called directly, it lowers statically to `User__print(user)`.

2. **Generic Static Monomorphization:**
   When a generic function `fn func<T: Trait>(arg: T)` is called with concrete type `Struct`:
   - The compiler produces a specialized copy `func__Struct` with `T` substituted by `Struct`.
   - Method calls `arg.method()` inside `func__Struct` resolve monomorphically to `Struct__method(arg)`.
   - The call site `func(val)` is lowered to call `func__Struct(val)`.
   - **Result:** Complete zero-cost static dispatch. No vtables, no dynamic lookups, 100% native runtime compatibility.

---

## 5. Diagnostics Matrix

| Error Code | Trigger Condition | Example Message |
|---|---|---|
| **E201** | `trait` or `impl Trait for Struct` used in Edition 2026 | `Traits are an experimental feature in HKD. Enable with #feature(traits) or set edition = "2027" in hkd.toml` |
| **E301** | Non-existent trait in `impl Trait for Struct` | `Cannot find trait 'NonExistent' in scope` |
| **E301** | Non-existent struct in `impl Trait for Struct` | `Cannot find struct 'NonExistent' in scope` |
| **E304** | Duplicate implementation of `impl Trait for Struct` | `Duplicate implementation of trait 'Printable' for struct 'User'` |
| **E304** | Duplicate method declared inside `trait` | `Method 'print' is declared more than once in trait 'Printable'` |
| **E307** | Trait method lacks `self` parameter | `First parameter of trait method 'print' must be 'self'` |
| **E307** | Parameter count mismatch in trait implementation | `Expected 2 parameter(s) for method 'print', got 1` |
| **E303** | Parameter or return type mismatch in trait implementation | `Type mismatch in method 'print': expected 'String', got 'Int'` |
| **E308** | Required trait method not implemented | `Struct 'User' does not implement required method 'print' of trait 'Printable'` |
| **E308** | Trait constraint violation at call site | `Type 'Number' does not implement trait 'Printable'` |

---

## 6. Coherence & Orphan Rule

To prevent conflicting implementations across modules without overcomplicating the language:
* **The HKD Trait Coherence Rule:** An `impl Trait for Struct` is valid only if either `Trait` OR `Struct` is defined in the current module or imported into the current scope.
* Duplicate `impl Trait for Struct` definitions within the same compilation unit or program are strictly rejected with `E304`.

---

## 7. Tooling & Ecosystem Verification Plan

1. **LSP:** Auto-completion for `trait` keyword, member completion on trait-bounded variables, signature hover for trait methods, and go-to-definition.
2. **Formatter:** Formats `trait` blocks with uniform 2-space indentation, blank lines between blocks.
3. **Dogfood Apps:**
   - **App A:** Generic Collection / Algorithm abstraction (`Printable`, `Summarizable`, `Comparable`).
   - **App B:** Domain Service abstraction (`Serializable`, `Validator`, `Repository`).
   - **App C:** Multi-module application spanning `traits.hkd`, `models.hkd`, `services.hkd`, and `main.hkd`.
4. **Benchmarking:** Compare procedural function, struct method, and trait-constrained generic function execution time and allocations.
