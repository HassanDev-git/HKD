# RFC-003 Status: Traits

**Status:** Experimental and incomplete. See the [proposal](../rfcs/003-traits.md).

The lexer recognizes feature-gated trait-related tokens. The main parser, semantic analysis, bytecode compiler, and runtimes do not provide complete trait declarations, implementations, or trait-object dispatch. Do not rely on traits as a supported language feature in HKD 1.1.0.

An implementation requires parser and AST support, trait checking and coherence rules, compiler lowering, and tests across the TypeScript VM and Zig interpreter. This status page is a capability summary, not a release certification.
