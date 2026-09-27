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
import { SourceSpan } from "../errors/index.js";

function makeIdent(name: string, span: SourceSpan): N.IdentExpr {
  return { kind: "IdentExpr", name, span };
}

function makeNull(span: SourceSpan): N.NullLiteral {
  return { kind: "NullLiteral", span };
}

function makeInt(value: number, span: SourceSpan): N.IntLiteral {
  return { kind: "IntLiteral", value, raw: String(value), span };
}

function makeParam(name: string, span: SourceSpan): N.Param {
  return { name, typeAnnotation: null, defaultValue: null, span };
}

function makeCall(calleeName: string, args: N.Expr[], span: SourceSpan): N.CallExpr {
  return {
    kind: "CallExpr",
    callee: makeIdent(calleeName, span),
    args,
    span,
  };
}

function makeVarDecl(name: string, init: N.Expr, span: SourceSpan): N.VarDeclStmt {
  return {
    kind: "VarDeclStmt",
    name,
    typeAnnotation: null,
    initializer: init,
    mutable: true,
    span,
  };
}

function makeAssign(targetName: string, value: N.Expr, span: SourceSpan): N.ExprStmt {
  return {
    kind: "ExprStmt",
    expr: {
      kind: "AssignExpr",
      target: makeIdent(targetName, span),
      value,
      span,
    },
    span,
  };
}

function makeReturnFuture(span: SourceSpan): N.ReturnStmt {
  return {
    kind: "ReturnStmt",
    value: makeIdent("__future__", span),
    span,
  };
}

/** Check if an expression or any subexpression is an AwaitExpr. */
export function hasAwait(node: N.AstNode): boolean {
  if (!node) return false;
  const anyNode = node as any;
  if (anyNode.kind === "AwaitExpr") return true;

  for (const key of Object.keys(anyNode)) {
    if (key === "span") continue;
    const val = anyNode[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === "object" && hasAwait(item)) return true;
      }
    } else if (val && typeof val === "object" && val.kind) {
      if (hasAwait(val)) return true;
    }
  }
  return false;
}

/** Collect all variable names declared via `let` in statement list. */
function collectDeclaredVariables(stmts: N.Stmt[]): string[] {
  const vars: string[] = [];
  for (const s of stmts) {
    if (s.kind === "VarDeclStmt") {
      vars.push(s.name);
    } else if (s.kind === "BlockStmt") {
      vars.push(...collectDeclaredVariables(s.body));
    }
  }
  return Array.from(new Set(vars));
}

function rewriteReturnsInStmt(stmt: N.Stmt): N.Stmt {
  if (stmt.kind === "FunctionDeclStmt") return stmt;
  if (stmt.kind === "ReturnStmt") {
    const val = stmt.value ?? makeNull(stmt.span);
    return {
      kind: "BlockStmt",
      body: [
        {
          kind: "ExprStmt",
          expr: makeCall("__hkd_resolve", [makeIdent("__future__", stmt.span), val], stmt.span),
          span: stmt.span,
        },
        makeReturnFuture(stmt.span),
      ],
      span: stmt.span,
    };
  }
  if (stmt.kind === "IfStmt") {
    return {
      ...stmt,
      then: rewriteReturnsInStmt(stmt.then) as N.BlockStmt,
      else_: stmt.else_ ? (rewriteReturnsInStmt(stmt.else_) as any) : null,
    };
  }
  if (stmt.kind === "WhileStmt") {
    return {
      ...stmt,
      body: rewriteReturnsInStmt(stmt.body) as N.BlockStmt,
    };
  }
  if (stmt.kind === "ForStmt") {
    return {
      ...stmt,
      body: rewriteReturnsInStmt(stmt.body) as N.BlockStmt,
    };
  }
  if (stmt.kind === "BlockStmt") {
    return {
      ...stmt,
      body: stmt.body.map(rewriteReturnsInStmt),
    };
  }
  return stmt;
}

/**
 * Desugars an `async fn` AST declaration into a standard synchronous `fn`
 * containing a state-machine `__step__()` closure and returning a `Future`.
 */
export function desugarAsyncFunction(stmt: N.FunctionDeclStmt): N.FunctionDeclStmt {
  const span = stmt.span;
  const declaredVars = collectDeclaredVariables(stmt.body.body);

  // States partitions: array of statements per state
  const states: N.Stmt[][] = [[]];
  let currentStateIdx = 0;
  let awaitCounter = 0;

  for (let i = 0; i < stmt.body.body.length; i++) {
    const s = stmt.body.body[i];

    if (s.kind === "VarDeclStmt" && s.initializer && s.initializer.kind === "AwaitExpr") {
      // let x = await operand
      const operand = s.initializer.expr;
      const futName = `__fut_${awaitCounter++}__`;
      const nextState = currentStateIdx + 1;

      // 1. In current state: evaluate operand
      states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));

      // 2. If pending, set state, register continuation, return __future__
      const onCompleteCallback: N.FunctionExpr = {
        kind: "FunctionExpr",
        params: [makeParam("__val__", s.span)],
        returnType: null,
        body: {
          kind: "BlockStmt",
          body: [
            makeAssign("__resume_val__", makeIdent("__val__", s.span), s.span),
            { kind: "ExprStmt", expr: makeCall("__step__", [], s.span), span: s.span },
          ],
          span: s.span,
        },
        span: s.span,
      };

      const ifPendingStmt: N.IfStmt = {
        kind: "IfStmt",
        condition: makeCall("__hkd_is_pending", [makeIdent(futName, s.span)], s.span),
        then: {
          kind: "BlockStmt",
          body: [
            makeAssign("__state__", makeInt(nextState, s.span), s.span),
            {
              kind: "ExprStmt",
              expr: makeCall("__hkd_on_complete", [makeIdent(futName, s.span), onCompleteCallback], s.span),
              span: s.span,
            },
            makeReturnFuture(s.span),
          ],
          span: s.span,
        },
        else_: null,
        span: s.span,
      };
      states[currentStateIdx].push(ifPendingStmt);

      // 3. If resolved, unwrap immediately and proceed to next state
      states[currentStateIdx].push(
        makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span)
      );
      states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));

      // 4. Begin next state
      states.push([]);
      currentStateIdx = nextState;

      // 5. Assign result to variable in next state
      states[currentStateIdx].push(makeAssign(s.name, makeIdent("__resume_val__", s.span), s.span));
    } else if (
      s.kind === "ExprStmt" &&
      s.expr.kind === "AssignExpr" &&
      s.expr.value.kind === "AwaitExpr"
    ) {
      // x = await operand
      const targetName = (s.expr.target as N.IdentExpr).name ?? "__tmp__";
      const operand = s.expr.value.expr;
      const futName = `__fut_${awaitCounter++}__`;
      const nextState = currentStateIdx + 1;

      states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));

      const onCompleteCallback: N.FunctionExpr = {
        kind: "FunctionExpr",
        params: [makeParam("__val__", s.span)],
        returnType: null,
        body: {
          kind: "BlockStmt",
          body: [
            makeAssign("__resume_val__", makeIdent("__val__", s.span), s.span),
            { kind: "ExprStmt", expr: makeCall("__step__", [], s.span), span: s.span },
          ],
          span: s.span,
        },
        span: s.span,
      };

      states[currentStateIdx].push({
        kind: "IfStmt",
        condition: makeCall("__hkd_is_pending", [makeIdent(futName, s.span)], s.span),
        then: {
          kind: "BlockStmt",
          body: [
            makeAssign("__state__", makeInt(nextState, s.span), s.span),
            {
              kind: "ExprStmt",
              expr: makeCall("__hkd_on_complete", [makeIdent(futName, s.span), onCompleteCallback], s.span),
              span: s.span,
            },
            makeReturnFuture(s.span),
          ],
          span: s.span,
        },
        else_: null,
        span: s.span,
      });

      states[currentStateIdx].push(
        makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span)
      );
      states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));

      states.push([]);
      currentStateIdx = nextState;
      states[currentStateIdx].push(makeAssign(targetName, makeIdent("__resume_val__", s.span), s.span));
    } else if (s.kind === "ExprStmt" && s.expr.kind === "AwaitExpr") {
      // await operand
      const operand = s.expr.expr;
      const futName = `__fut_${awaitCounter++}__`;
      const nextState = currentStateIdx + 1;

      states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));

      const onCompleteCallback: N.FunctionExpr = {
        kind: "FunctionExpr",
        params: [makeParam("__val__", s.span)],
        returnType: null,
        body: {
          kind: "BlockStmt",
          body: [
            makeAssign("__resume_val__", makeIdent("__val__", s.span), s.span),
            { kind: "ExprStmt", expr: makeCall("__step__", [], s.span), span: s.span },
          ],
          span: s.span,
        },
        span: s.span,
      };

      states[currentStateIdx].push({
        kind: "IfStmt",
        condition: makeCall("__hkd_is_pending", [makeIdent(futName, s.span)], s.span),
        then: {
          kind: "BlockStmt",
          body: [
            makeAssign("__state__", makeInt(nextState, s.span), s.span),
            {
              kind: "ExprStmt",
              expr: makeCall("__hkd_on_complete", [makeIdent(futName, s.span), onCompleteCallback], s.span),
              span: s.span,
            },
            makeReturnFuture(s.span),
          ],
          span: s.span,
        },
        else_: null,
        span: s.span,
      });

      states[currentStateIdx].push(
        makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span)
      );
      states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));

      states.push([]);
      currentStateIdx = nextState;
    } else if (s.kind === "ReturnStmt" && s.value && s.value.kind === "AwaitExpr") {
      // return await operand
      const operand = s.value.expr;
      const futName = `__fut_${awaitCounter++}__`;
      const nextState = currentStateIdx + 1;

      states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));

      const onCompleteCallback: N.FunctionExpr = {
        kind: "FunctionExpr",
        params: [makeParam("__val__", s.span)],
        returnType: null,
        body: {
          kind: "BlockStmt",
          body: [
            makeAssign("__resume_val__", makeIdent("__val__", s.span), s.span),
            { kind: "ExprStmt", expr: makeCall("__step__", [], s.span), span: s.span },
          ],
          span: s.span,
        },
        span: s.span,
      };

      states[currentStateIdx].push({
        kind: "IfStmt",
        condition: makeCall("__hkd_is_pending", [makeIdent(futName, s.span)], s.span),
        then: {
          kind: "BlockStmt",
          body: [
            makeAssign("__state__", makeInt(nextState, s.span), s.span),
            {
              kind: "ExprStmt",
              expr: makeCall("__hkd_on_complete", [makeIdent(futName, s.span), onCompleteCallback], s.span),
              span: s.span,
            },
            makeReturnFuture(s.span),
          ],
          span: s.span,
        },
        else_: null,
        span: s.span,
      });

      states[currentStateIdx].push(
        makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span)
      );
      states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));

      states.push([]);
      currentStateIdx = nextState;
      states[currentStateIdx].push({
        kind: "ExprStmt",
        expr: makeCall("__hkd_resolve", [makeIdent("__future__", s.span), makeIdent("__resume_val__", s.span)], s.span),
        span: s.span,
      });
      states[currentStateIdx].push(makeReturnFuture(s.span));
    } else if (s.kind === "ReturnStmt") {
      // return expr
      const val = s.value ?? makeNull(s.span);
      states[currentStateIdx].push({
        kind: "ExprStmt",
        expr: makeCall("__hkd_resolve", [makeIdent("__future__", s.span), val], s.span),
        span: s.span,
      });
      states[currentStateIdx].push(makeReturnFuture(s.span));
    } else if (s.kind === "VarDeclStmt") {
      // Standard `let x = expr;` -> since `x` is hoisted to outer scope, convert to `x = expr;`
      if (s.initializer) {
        states[currentStateIdx].push(makeAssign(s.name, s.initializer, s.span));
      }
    } else {
      // Other statements
      states[currentStateIdx].push(rewriteReturnsInStmt(s));
    }
  }

  // Ensure last state ends with resolution if not explicitly returned
  const lastState = states[states.length - 1];
  const lastStmt = lastState[lastState.length - 1];
  if (!lastStmt || lastStmt.kind !== "ReturnStmt") {
    lastState.push({
      kind: "ExprStmt",
      expr: makeCall("__hkd_resolve", [makeIdent("__future__", span), makeNull(span)], span),
      span,
    });
    lastState.push(makeReturnFuture(span));
  }

  // Build `__step__()` function body
  const stepBody: N.Stmt[] = [];
  for (let sIdx = 0; sIdx < states.length; sIdx++) {
    const cond: N.BinaryExpr = {
      kind: "BinaryExpr",
      op: "==",
      left: makeIdent("__state__", span),
      right: makeInt(sIdx, span),
      span,
    };
    stepBody.push({
      kind: "IfStmt",
      condition: cond,
      then: {
        kind: "BlockStmt",
        body: states[sIdx],
        span,
      },
      else_: null,
      span,
    });
  }
  stepBody.push(makeReturnFuture(span));

  // Build outer function statements
  const outerBody: N.Stmt[] = [];

  // 1. let __future__ = __hkd_future(null)
  outerBody.push(makeVarDecl("__future__", makeCall("__hkd_future", [makeNull(span)], span), span));

  // 2. let __state__ = 0
  outerBody.push(makeVarDecl("__state__", makeInt(0, span), span));

  // 3. let __resume_val__ = null
  outerBody.push(makeVarDecl("__resume_val__", makeNull(span), span));

  // 4. Hoist all declared variables
  for (const vName of declaredVars) {
    outerBody.push(makeVarDecl(vName, makeNull(span), span));
  }

  // 5. fn __step__() { ... }
  const stepFnDecl: N.FunctionDeclStmt = {
    kind: "FunctionDeclStmt",
    name: "__step__",
    isAsync: false,
    params: [],
    returnType: null,
    body: {
      kind: "BlockStmt",
      body: stepBody,
      span,
    },
    exported: false,
    span,
  };
  outerBody.push(stepFnDecl);

  // 6. __step__()
  outerBody.push({
    kind: "ExprStmt",
    expr: makeCall("__step__", [], span),
    span,
  });

  // 7. return __future__
  outerBody.push(makeReturnFuture(span));

  return {
    kind: "FunctionDeclStmt",
    name: stmt.name,
    isAsync: false, // lowered to synchronous closure
    typeParams: stmt.typeParams,
    typeParamBounds: stmt.typeParamBounds,
    params: stmt.params,
    returnType: stmt.returnType,
    body: {
      kind: "BlockStmt",
      body: outerBody,
      span,
    },
    exported: stmt.exported,
    span: stmt.span,
  };
}

/**
 * Desugars an anonymous `async fn(...)` expression into a standard synchronous `FunctionExpr`.
 */
export function desugarAsyncFunctionExpr(expr: N.FunctionExpr): N.FunctionExpr {
  const dummyDecl: N.FunctionDeclStmt = {
    kind: "FunctionDeclStmt",
    name: "<anonymous_async>",
    isAsync: true,
    typeParams: expr.typeParams,
    params: expr.params,
    returnType: expr.returnType,
    body: expr.body,
    exported: false,
    span: expr.span,
  };

  const desugared = desugarAsyncFunction(dummyDecl);
  return {
    kind: "FunctionExpr",
    isAsync: false,
    typeParams: desugared.typeParams,
    params: desugared.params,
    returnType: desugared.returnType,
    body: desugared.body,
    span: expr.span,
  };
}
