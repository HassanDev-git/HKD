# RFC 003: Behavioural Contracts & Traits for HKD

- Feature Name: `traits`
- Start Date: 2026-09-04
- RFC PR: [hkd/rfcs#003](https://github.com/hkdlang/rfcs/pull/003)
- Tracking Issue: [hkd/hkd#1003](https://github.com/hkdlang/hkd/issues/1003)
- Target Edition: `2027` (or `#feature(traits)`)
- Status: `Proposed`

---

## 1. Summary

This RFC defines a clean, minimal abstraction for behavioral contracts (traits/interfaces) in HKD, enabling shared method contracts across structs with zero dynamic dispatch overhead when statically resolved.

```hkd
trait Summary {
    fn summarize(self) -> String
}

struct Article {
    title: String,
    author: String
}

impl Summary for Article {
    fn summarize(self) -> String {
        return self.title + " by " + self.author
    }
}
```

---

## 2. Motivation

HKD 1.0 supports data structs (`struct User { name: String }`) and standalone functions, but lacks a formal mechanism for polymorphism across different data types. Functions cannot express "any type that can serialize itself" or "any type that can compute an area". Traits provide modular, reusable behavioral interfaces.

---

## 3. Guide-Level Explanation

* A `trait` declares a set of method signatures that implementing types must provide.
* An `impl Trait for Struct` block supplies the concrete method definitions.
* Methods receive `self` as the first argument representing the instance.

```hkd
let a = Article { title: "HKD 1.1", author: "Hassan" }
print(a.summarize())
```

---

## 4. Reference-Level Explanation

### Dispatch Strategy
* **Static Monomorphic Dispatch (Default)**: When the receiver type is known at compile time, calls to `a.summarize()` resolve directly to the mangled static function `Article_summarize(a)`, requiring zero vtable lookup or allocation overhead.
* **Trait Objects (Future Consideration)**: If heterogeneous collections of different trait implementors are needed, explicit dynamic dispatch can be enabled via `dyn Trait`.

### Coherence Rules
* An `impl Trait for Type` must reside in either the module defining `Trait` or the module defining `Type` (orphan rule), preventing conflicting definitions.

---

## 5. Backward Compatibility

* `trait` and `impl` are reserved keywords only in Edition 2027 or under `#feature(traits)`.
* Struct declarations from 1.0 remain 100% valid.

---

## 6. Drawbacks and Alternatives

* **Drawbacks**: Adds coherence validation and orphan rules to the module system, requiring additional type checking phases.
* **Alternatives Considered**: Java-style class inheritance or Go-style structural interfaces. Explicit traits were chosen for predictable static dispatch and clear semantic contracts.

