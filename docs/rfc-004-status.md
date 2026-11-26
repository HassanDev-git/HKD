# RFC-004 Status: Async/Await

**Status:** Experimental and incomplete. See the [proposal](../rfcs/004-async-ergonomics.md).

Some asynchronous library APIs and runtime scheduling components exist. HKD 1.1.0 does not provide complete language-level `async fn` or `await` parsing, semantic analysis, or compiler lowering. Library APIs do not imply support for async/await syntax.

An implementation requires parser and AST support, future/result type checking, compiler lowering, and tests across the TypeScript VM and Zig interpreter. This status page is a capability summary, not a release certification.
