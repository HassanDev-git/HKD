/**
 * HKD Async/Await State-Machine Lowering
 *
 * Desugars `async fn` AST nodes into deterministic state-machine closures
 * executing against the HKD task scheduler and event loop.
 *
 * Implements RFC-004:
 *   - Lifts live variables across suspension points into outer closure slots.
 *   - Generates sequential states (0, 1, ..., N) partitioned by `await` suspension points.
 *   - Connects continuation callbacks to `__hkd_on_complete` and returns `Future`.
 *   - Uses standard opcodes with ZERO bytecode changes.
 */
import * as N from "../ast/nodes.js";
/** Check if an expression or any subexpression is an AwaitExpr. */
export declare function hasAwait(node: N.AstNode | null | undefined): boolean;
/**
 * Desugars an `async fn` AST declaration into a standard synchronous `fn`
 * containing a state-machine `__step__()` closure and returning a `Future`.
 */
export declare function desugarAsyncFunction(stmt: N.FunctionDeclStmt): N.FunctionDeclStmt;
/**
 * Desugars an anonymous `async fn(...)` expression into a standard synchronous `FunctionExpr`.
 */
export declare function desugarAsyncFunctionExpr(expr: N.FunctionExpr): N.FunctionExpr;
//# sourceMappingURL=async_lowering.d.ts.map