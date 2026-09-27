# RFC 001: Parametric Polymorphism & Generic Functions for HKD

- Feature Name: `generics`
- Start Date: 2026-09-04
- RFC PR: [hkd/rfcs#001](https://github.com/hkdlang/rfcs/pull/001)
- Tracking Issue: [hkd/hkd#1001](https://github.com/hkdlang/hkd/issues/1001)
- Target Edition: `2027` (or `#feature(generics)`)
- Status: `Proposed`

---

## 1. Summary

This RFC proposes introducing first-class parametric polymorphism (generics) into HKD, beginning with generic functions and explicit type instantiation, with a designed path toward generic data structures.

```hkd
fn identity<T>(value: T) -> T {
    return value
}

let num = identity<Int>(42)
let str = identity<String>("HKD")
```

---

## 2. Motivation

In HKD 1.0, writing reusable utility functions (such as identity, array transformation, swapping, or optional value unwrapping) requires either duplicating code across types or resorting to dynamic `Any` types, which defeats static type checking. Generics provide type safety, static documentation, and code reusability without sacrificing runtime efficiency.

---

## 3. Guide-Level Explanation

### Defining Generic Functions
Type parameters are enclosed in angle brackets `<T>` immediately following the function name:

```hkd
fn pair<T, U>(first: T, second: U) -> [T] {
    return [first]
}
```

### Calling Generic Functions
Generic functions can be invoked with explicit type arguments:

```hkd
let x = identity<Int>(100)
```

If type arguments are omitted, the semantic analyzer infers `T` from the call arguments when unambiguous:

```hkd
let y = identity(200) // infers T = Int
```

---

## 4. Reference-Level Explanation

### AST Additions
* `TypeParameter`: `{ name: string, constraint?: TypeExpr }`
* `FunctionDeclStmt`: added `typeParameters?: TypeParameter[]`
* `CallExpr`: added `typeArguments?: TypeExpr[]`

### Semantic Analysis
1. Type parameters are registered as `TypeParameterType` in the function's lexical type scope.
2. During call resolution:
   - Type substitution replaces type parameters `T` with concrete argument types.
   - If explicit type arguments are provided, arity is validated.
   - Return type is computed from substituted body or signature.

### Lowering Strategy
* **Monomorphization**: For AOT/JIT native compilation, concrete specializations (`identity_Int`, `identity_String`) are emitted to avoid boxing overhead.
* **VM/Bytecode**: In the bytecode stack VM, operations on generic values utilize standard polymorphic stack slots, preserving backward compatibility with HKDB V2.

---

## 5. Backward Compatibility

* Code in Edition 2026 without `#feature(generics)` rejects generic angle bracket syntax with a helpful error:
  `Generic functions require #feature(generics) or edition = "2027"`.
* Existing function declarations and calls are 100% unaffected.

---

## 6. Alternatives Considered

* Dynamic Boxing (`Any`): Discards static safety and diagnostics.
* Type Erasure (Java-style): Complicates reflection and native JIT specialization.
