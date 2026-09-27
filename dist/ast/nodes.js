"use strict";
/**
 * HKD Abstract Syntax Tree (AST) Node Definitions
 *
 * The AST is the canonical in-memory representation of an HKD program.
 * Every node carries a SourceSpan for error reporting and tooling.
 *
 * Design principles:
 *  - All nodes are plain data (no methods) — behaviour lives in visitors
 *  - Discriminated unions via `kind` string literals
 *  - Type annotations are optional (for gradual typing support)
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=nodes.js.map