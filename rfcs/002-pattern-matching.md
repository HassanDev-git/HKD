# RFC 002: Structured Pattern Matching for HKD

- Feature Name: `pattern_matching`
- Start Date: 2026-09-04
- RFC PR: [hkd/rfcs#002](https://github.com/hkdlang/rfcs/pull/002)
- Tracking Issue: [hkd/hkd#1002](https://github.com/hkdlang/hkd/issues/1002)
- Target Edition: `2027` (or `#feature(pattern_matching)`)
- Status: `Proposed`

---

## 1. Summary

This RFC introduces structured pattern matching into HKD through `match` expressions and statements.

```hkd
let description = match code {
    200 => "OK",
    404 => "Not Found",
    500 => "Internal Error",
    _   => "Unknown Code"
}
```

---

## 2. Motivation

In HKD 1.0, conditional branching over values and structures relies on chained `if / else if / else` statements. This is verbose, error-prone, lacks exhaustiveness checking, and cannot cleanly destructure arrays or records. Structured pattern matching provides declarative control flow, exhaustiveness validation, and compiler-optimized branch lowering.

---

## 3. Guide-Level Explanation

### Basic Syntax
A `match` expression inspects a scrutinee expression and matches it against ordered arms:

```hkd
match value {
    pattern1 => result1,
    pattern2 => {
        let transformed = process(value)
        return transformed
    },
    _ => fallback
}
```

### Supported Pattern Forms
1. **Literal Patterns**: Exact matches for integer, float, string, boolean, or null (`0`, `"GET"`, `true`, `null`).
2. **Wildcard Pattern (`_`)**: Matches any value without binding.
3. **Variable Binding Pattern**: Binds the scrutinee value to a local variable within the arm.
4. **Array Destructuring**: Matches fixed-length or prefix array elements (`[first, second]`).

---

## 4. Reference-Level Explanation

### AST Additions
* `MatchExpr`: `{ scrutinee: Expr, arms: MatchArm[] }`
* `MatchArm`: `{ pattern: Pattern, guard?: Expr, body: Expr | BlockStmt }`
* `Pattern`:
  - `LiteralPattern`: `{ value: Literal }`
  - `WildcardPattern`: `{}`
  - `BindingPattern`: `{ name: string }`
  - `ArrayPattern`: `{ elements: Pattern[] }`

### Semantic Analysis
* **Exhaustiveness**: The analyser verifies that all values of the scrutinee type are handled, or that a wildcard `_` / binding pattern is present.
* **Reachability**: Arms occurring after an unconditional wildcard `_` are rejected as unreachable (`ErrorCode.E306`).

### Lowering to Bytecode
Rather than evaluating patterns dynamically via runtime helper calls, the bytecode compiler lowers literal patterns into sequential comparison and jump instructions (`Op.Eq`, `Op.JumpFalse`), jumping directly to the matching arm body.

---

## 5. Backward Compatibility

* In Edition 2026 without `#feature(pattern_matching)`, `match` is treated as a standard identifier, preserving existing code that may have used `match` as a variable name.
* Enabling `edition = "2027"` or `#feature(pattern_matching)` activates `match` as a reserved keyword.

---

## 6. Drawbacks and Alternatives

* **Drawbacks**: Introduces a new reserved keyword `match` in Edition 2027 and increases compiler complexity in semantic reachability analysis and jump table emission.
* **Alternatives Considered**: Lisp-style `cond` or traditional C-style `switch/case`. Pattern matching was selected because it delivers type-safe structural destructuring, pattern guards, and compile-time exhaustiveness checking.

