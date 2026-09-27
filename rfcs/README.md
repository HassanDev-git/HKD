# HKD RFC (Request for Comments) Process

The HKD RFC process provides a structured, collaborative mechanism for proposing substantial changes and features to the HKD programming language, standard library, and core tooling.

---

## When to Submit an RFC

You **MUST** submit an RFC for:
* Any new syntax or language keyword.
* Changes to static semantic analysis or type checking rules.
* Additions or modifications to the Standard Library API.
* Changes to the Bytecode ISA or serialization format.
* Significant alterations to the Package Manager (`hkd.toml`, `hkd.lock`, `.hkdpack`).
* Major architecture updates to LSP or DAP servers.

You **DO NOT** need an RFC for:
* Bug fixes and regression patches conforming to existing specifications.
* Documentation improvements, spelling fixes, or typo corrections.
* Refactorings that do not alter public behavior, APIs, or performance guarantees.
* Micro-optimizations within allowed performance tolerances.

---

## The RFC Lifecycle

```
[Draft / PR] -> [Active Review] -> [Final Comment Period (FCP)] -> [Accepted / Closed] -> [Implemented]
```

1. **Copy Template**: Copy `0000-template.md` to `text/0000-my-proposal.md`.
2. **Draft & Discuss**: Open a Pull Request titled `RFC: <Your Title>`.
3. **Review**: The HKD Core Team and community evaluate technical merit, ergonomics, backward compatibility, and maintenance burden.
4. **Final Comment Period (FCP)**: A 14-day window announcing intent to accept or decline.
5. **Acceptance**: Merged into `rfcs/accepted/` with an assigned number.
