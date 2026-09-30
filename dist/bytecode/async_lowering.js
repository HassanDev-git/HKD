"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasAwait = hasAwait;
exports.desugarAsyncFunction = desugarAsyncFunction;
exports.desugarAsyncFunctionExpr = desugarAsyncFunctionExpr;
function makeIdent(name, span) {
    return { kind: "IdentExpr", name, span };
}
function makeNull(span) {
    return { kind: "NullLiteral", span };
}
function makeInt(value, span) {
    return { kind: "IntLiteral", value, raw: String(value), span };
}
function makeParam(name, span) {
    return { name, typeAnnotation: null, defaultValue: null, span };
}
function makeCall(calleeName, args, span) {
    return {
        kind: "CallExpr",
        callee: makeIdent(calleeName, span),
        args,
        span,
    };
}
function makeVarDecl(name, init, span) {
    return {
        kind: "VarDeclStmt",
        name,
        typeAnnotation: null,
        initializer: init,
        mutable: true,
        span,
    };
}
function makeAssign(targetName, value, span) {
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
function makeReturnFuture(span) {
    return {
        kind: "ReturnStmt",
        value: makeIdent("__future__", span),
        span,
    };
}
function makeMember(obj, property, span) {
    return {
        kind: "MemberExpr",
        object: obj,
        property,
        optional: false,
        span,
    };
}
function makeString(value, span) {
    return {
        kind: "StringLiteral",
        value,
        span,
    };
}
/** Check if an expression or any subexpression is an AwaitExpr. */
function hasAwait(node) {
    if (!node)
        return false;
    const n = node;
    switch (n.kind) {
        case "AwaitExpr":
            return true;
        case "BinaryExpr":
            return hasAwait(n.left) || hasAwait(n.right);
        case "UnaryExpr":
            return hasAwait(n.operand);
        case "CallExpr":
            if (hasAwait(n.callee))
                return true;
            for (let i = 0; i < n.args.length; i++) {
                if (hasAwait(n.args[i]))
                    return true;
            }
            return false;
        case "IndexExpr":
            return hasAwait(n.object) || hasAwait(n.index);
        case "MemberExpr":
            return hasAwait(n.object);
        case "AssignExpr":
            return hasAwait(n.target) || hasAwait(n.value);
        case "CompoundAssignExpr":
            return hasAwait(n.target) || hasAwait(n.value);
        case "ArrayExpr":
            for (let i = 0; i < n.elements.length; i++) {
                if (hasAwait(n.elements[i]))
                    return true;
            }
            return false;
        case "ObjectExpr":
            for (let i = 0; i < n.fields.length; i++) {
                if (hasAwait(n.fields[i].value))
                    return true;
            }
            return false;
        case "IfExpr":
            return hasAwait(n.condition) || hasAwait(n.then) || (n.else_ ? hasAwait(n.else_) : false);
        case "BlockExpr":
            for (let i = 0; i < n.body.length; i++) {
                if (hasAwait(n.body[i]))
                    return true;
            }
            return false;
        case "StructInitExpr":
            for (let i = 0; i < n.fields.length; i++) {
                if (hasAwait(n.fields[i].value))
                    return true;
            }
            return false;
        case "RangeExpr":
            return hasAwait(n.start) || hasAwait(n.end);
        case "CastExpr":
            return hasAwait(n.expr);
        case "MatchExpr":
            if (hasAwait(n.scrutinee))
                return true;
            for (let i = 0; i < n.arms.length; i++) {
                const arm = n.arms[i];
                if (arm.guard && hasAwait(arm.guard))
                    return true;
                if (hasAwait(arm.body))
                    return true;
            }
            return false;
        case "VarDeclStmt":
            return n.initializer ? hasAwait(n.initializer) : false;
        case "ConstDeclStmt":
            return hasAwait(n.initializer);
        case "ExprStmt":
            return hasAwait(n.expr);
        case "ReturnStmt":
            return n.value ? hasAwait(n.value) : false;
        case "IfStmt":
            return hasAwait(n.condition) || hasAwait(n.then) || (n.else_ ? hasAwait(n.else_) : false);
        case "WhileStmt":
            return hasAwait(n.condition) || hasAwait(n.body);
        case "ForStmt":
            return hasAwait(n.iterable) || hasAwait(n.body);
        case "BlockStmt":
            for (let i = 0; i < n.body.length; i++) {
                if (hasAwait(n.body[i]))
                    return true;
            }
            return false;
        case "AssertStmt":
            return hasAwait(n.condition) || (n.message ? hasAwait(n.message) : false);
        default:
            return false;
    }
}
let liftCounter = 0;
/** Recursively lift AwaitExpr from arbitrary subexpressions into top-level statements. */
function liftAwaitsFromExpr(expr, liftedStmts) {
    if (!expr || !hasAwait(expr))
        return expr;
    if (expr.kind === "AwaitExpr") {
        const operand = liftAwaitsFromExpr(expr.expr, liftedStmts);
        const tmpName = `__await_lift_${liftCounter++}__`;
        const span = expr.span;
        liftedStmts.push(makeVarDecl(tmpName, { kind: "AwaitExpr", expr: operand, span }, span));
        return makeIdent(tmpName, span);
    }
    switch (expr.kind) {
        case "BinaryExpr":
            return {
                ...expr,
                left: liftAwaitsFromExpr(expr.left, liftedStmts),
                right: liftAwaitsFromExpr(expr.right, liftedStmts),
            };
        case "UnaryExpr":
            return {
                ...expr,
                operand: liftAwaitsFromExpr(expr.operand, liftedStmts),
            };
        case "CallExpr":
            return {
                ...expr,
                callee: liftAwaitsFromExpr(expr.callee, liftedStmts),
                args: expr.args.map((a) => liftAwaitsFromExpr(a, liftedStmts)),
            };
        case "IndexExpr":
            return {
                ...expr,
                object: liftAwaitsFromExpr(expr.object, liftedStmts),
                index: liftAwaitsFromExpr(expr.index, liftedStmts),
            };
        case "MemberExpr":
            return {
                ...expr,
                object: liftAwaitsFromExpr(expr.object, liftedStmts),
            };
        case "AssignExpr":
            return {
                ...expr,
                target: liftAwaitsFromExpr(expr.target, liftedStmts),
                value: liftAwaitsFromExpr(expr.value, liftedStmts),
            };
        case "CompoundAssignExpr":
            return {
                ...expr,
                target: liftAwaitsFromExpr(expr.target, liftedStmts),
                value: liftAwaitsFromExpr(expr.value, liftedStmts),
            };
        case "ArrayExpr":
            return {
                ...expr,
                elements: expr.elements.map((e) => liftAwaitsFromExpr(e, liftedStmts)),
            };
        case "ObjectExpr":
            return {
                ...expr,
                fields: expr.fields.map((f) => ({
                    ...f,
                    value: liftAwaitsFromExpr(f.value, liftedStmts),
                })),
            };
        case "StructInitExpr":
            return {
                ...expr,
                fields: expr.fields.map((f) => ({
                    ...f,
                    value: liftAwaitsFromExpr(f.value, liftedStmts),
                })),
            };
        case "RangeExpr":
            return {
                ...expr,
                start: liftAwaitsFromExpr(expr.start, liftedStmts),
                end: liftAwaitsFromExpr(expr.end, liftedStmts),
            };
        case "CastExpr":
            return {
                ...expr,
                expr: liftAwaitsFromExpr(expr.expr, liftedStmts),
            };
        default:
            return expr;
    }
}
/** Flatten blocks and lift awaits out of expressions in statements. */
function flattenAndLiftStmts(stmts) {
    const result = [];
    for (const s of stmts) {
        if (s.kind === "BlockStmt") {
            result.push(...flattenAndLiftStmts(s.body));
            continue;
        }
        if (!hasAwait(s)) {
            result.push(s);
            continue;
        }
        if (s.kind === "VarDeclStmt" && s.initializer) {
            if (s.initializer.kind === "AwaitExpr" && !hasAwait(s.initializer.expr)) {
                result.push(s);
            }
            else {
                const lifted = [];
                const newInit = liftAwaitsFromExpr(s.initializer, lifted);
                result.push(...flattenAndLiftStmts(lifted));
                result.push({ ...s, initializer: newInit });
            }
        }
        else if (s.kind === "ExprStmt") {
            if (s.expr.kind === "AwaitExpr" && !hasAwait(s.expr.expr)) {
                result.push(s);
            }
            else if (s.expr.kind === "AssignExpr" &&
                s.expr.value.kind === "AwaitExpr" &&
                !hasAwait(s.expr.value.expr)) {
                result.push(s);
            }
            else {
                const lifted = [];
                const newExpr = liftAwaitsFromExpr(s.expr, lifted);
                result.push(...flattenAndLiftStmts(lifted));
                result.push({ ...s, expr: newExpr });
            }
        }
        else if (s.kind === "ReturnStmt") {
            if (s.value && s.value.kind === "AwaitExpr" && !hasAwait(s.value.expr)) {
                result.push(s);
            }
            else if (s.value) {
                const lifted = [];
                const newVal = liftAwaitsFromExpr(s.value, lifted);
                result.push(...flattenAndLiftStmts(lifted));
                result.push({ ...s, value: newVal });
            }
            else {
                result.push(s);
            }
        }
        else if (s.kind === "IfStmt") {
            if (hasAwait(s.condition)) {
                const lifted = [];
                const newCond = liftAwaitsFromExpr(s.condition, lifted);
                result.push(...flattenAndLiftStmts(lifted));
                result.push({ ...s, condition: newCond });
            }
            else {
                result.push(s);
            }
        }
        else if (s.kind === "WhileStmt") {
            if (hasAwait(s.condition)) {
                const condAwait = s.condition;
                const tmpCond = `__await_cond_${liftCounter++}__`;
                const span = s.span;
                const breakStmt = { kind: "BreakStmt", span };
                const ifNotBreak = {
                    kind: "IfStmt",
                    condition: {
                        kind: "UnaryExpr",
                        op: "!",
                        operand: makeIdent(tmpCond, span),
                        span,
                    },
                    then: {
                        kind: "BlockStmt",
                        body: [breakStmt],
                        span,
                    },
                    else_: null,
                    span,
                };
                const newBodyStmts = [
                    makeVarDecl(tmpCond, condAwait, span),
                    ifNotBreak,
                    ...s.body.body,
                ];
                const infiniteWhile = {
                    kind: "WhileStmt",
                    condition: { kind: "BoolLiteral", value: true, span },
                    body: {
                        kind: "BlockStmt",
                        body: flattenAndLiftStmts(newBodyStmts),
                        span,
                    },
                    span,
                };
                result.push(infiniteWhile);
            }
            else {
                result.push(s);
            }
        }
        else {
            result.push(s);
        }
    }
    return result;
}
/** Collect all variable names declared via `let` in statement list. */
function collectDeclaredVariables(stmts) {
    const vars = [];
    function walkStmt(s) {
        if (!s)
            return;
        switch (s.kind) {
            case "VarDeclStmt":
                if (typeof s.name === "string")
                    vars.push(s.name);
                break;
            case "BlockStmt":
                for (let i = 0; i < s.body.length; i++)
                    walkStmt(s.body[i]);
                break;
            case "IfStmt":
                for (let i = 0; i < s.then.body.length; i++)
                    walkStmt(s.then.body[i]);
                if (s.else_) {
                    if (s.else_.kind === "BlockStmt") {
                        for (let i = 0; i < s.else_.body.length; i++)
                            walkStmt(s.else_.body[i]);
                    }
                    else if (s.else_.kind === "IfStmt") {
                        walkStmt(s.else_);
                    }
                }
                break;
            case "WhileStmt":
                for (let i = 0; i < s.body.body.length; i++)
                    walkStmt(s.body.body[i]);
                break;
            case "ForStmt":
                if (typeof s.variable === "string")
                    vars.push(s.variable);
                for (let i = 0; i < s.body.body.length; i++)
                    walkStmt(s.body.body[i]);
                break;
        }
    }
    for (let i = 0; i < stmts.length; i++) {
        walkStmt(stmts[i]);
    }
    return Array.from(new Set(vars));
}
function rewriteReturnsInStmt(stmt) {
    if (stmt.kind === "FunctionDeclStmt")
        return stmt;
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
            then: rewriteReturnsInStmt(stmt.then),
            else_: stmt.else_ ? rewriteReturnsInStmt(stmt.else_) : null,
        };
    }
    if (stmt.kind === "WhileStmt") {
        return {
            ...stmt,
            body: rewriteReturnsInStmt(stmt.body),
        };
    }
    if (stmt.kind === "ForStmt") {
        return {
            ...stmt,
            body: rewriteReturnsInStmt(stmt.body),
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
function desugarAsyncFunction(stmt) {
    const span = stmt.span;
    const canonicalStmts = flattenAndLiftStmts(stmt.body.body);
    const declaredVars = collectDeclaredVariables(canonicalStmts);
    // States partitions: array of statements per state
    const states = [[]];
    let currentStateIdx = 0;
    let awaitCounter = 0;
    for (let i = 0; i < canonicalStmts.length; i++) {
        const s = canonicalStmts[i];
        if (s.kind === "VarDeclStmt" && s.initializer && s.initializer.kind === "AwaitExpr") {
            // let x = await operand
            const operand = s.initializer.expr;
            const futName = `__fut_${awaitCounter++}__`;
            const nextState = currentStateIdx + 1;
            // 1. In current state: evaluate operand
            states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));
            // 2. If pending, set state, register continuation, return __future__
            const onCompleteCallback = {
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
            const ifPendingStmt = {
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
            states[currentStateIdx].push({
                kind: "IfStmt",
                condition: makeCall("__hkd_is_rejected", [makeIdent(futName, s.span)], s.span),
                then: {
                    kind: "BlockStmt",
                    body: [
                        {
                            kind: "ExprStmt",
                            expr: makeCall("__hkd_reject", [makeIdent("__future__", s.span), makeCall("__hkd_error", [makeIdent(futName, s.span)], s.span)], s.span),
                            span: s.span,
                        },
                        makeReturnFuture(s.span),
                    ],
                    span: s.span,
                },
                else_: null,
                span: s.span,
            });
            // 3. If resolved, unwrap immediately and proceed to next state
            states[currentStateIdx].push(makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span));
            states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));
            // 4. Begin next state
            states.push([]);
            currentStateIdx = nextState;
            // 5. Assign result to variable in next state
            states[currentStateIdx].push(makeAssign(s.name, makeIdent("__resume_val__", s.span), s.span));
        }
        else if (s.kind === "ExprStmt" &&
            s.expr.kind === "AssignExpr" &&
            s.expr.value.kind === "AwaitExpr") {
            // x = await operand
            const targetName = s.expr.target.name ?? "__tmp__";
            const operand = s.expr.value.expr;
            const futName = `__fut_${awaitCounter++}__`;
            const nextState = currentStateIdx + 1;
            states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));
            const onCompleteCallback = {
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
            states[currentStateIdx].push({
                kind: "IfStmt",
                condition: makeCall("__hkd_is_rejected", [makeIdent(futName, s.span)], s.span),
                then: {
                    kind: "BlockStmt",
                    body: [
                        {
                            kind: "ExprStmt",
                            expr: makeCall("__hkd_reject", [makeIdent("__future__", s.span), makeCall("__hkd_error", [makeIdent(futName, s.span)], s.span)], s.span),
                            span: s.span,
                        },
                        makeReturnFuture(s.span),
                    ],
                    span: s.span,
                },
                else_: null,
                span: s.span,
            });
            states[currentStateIdx].push(makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span));
            states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));
            states.push([]);
            currentStateIdx = nextState;
            states[currentStateIdx].push(makeAssign(targetName, makeIdent("__resume_val__", s.span), s.span));
        }
        else if (s.kind === "ExprStmt" && s.expr.kind === "AwaitExpr") {
            // await operand
            const operand = s.expr.expr;
            const futName = `__fut_${awaitCounter++}__`;
            const nextState = currentStateIdx + 1;
            states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));
            const onCompleteCallback = {
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
            states[currentStateIdx].push({
                kind: "IfStmt",
                condition: makeCall("__hkd_is_rejected", [makeIdent(futName, s.span)], s.span),
                then: {
                    kind: "BlockStmt",
                    body: [
                        {
                            kind: "ExprStmt",
                            expr: makeCall("__hkd_reject", [makeIdent("__future__", s.span), makeCall("__hkd_error", [makeIdent(futName, s.span)], s.span)], s.span),
                            span: s.span,
                        },
                        makeReturnFuture(s.span),
                    ],
                    span: s.span,
                },
                else_: null,
                span: s.span,
            });
            states[currentStateIdx].push(makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span));
            states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));
            states.push([]);
            currentStateIdx = nextState;
        }
        else if (s.kind === "ReturnStmt" && s.value && s.value.kind === "AwaitExpr") {
            // return await operand
            const operand = s.value.expr;
            const futName = `__fut_${awaitCounter++}__`;
            const nextState = currentStateIdx + 1;
            states[currentStateIdx].push(makeVarDecl(futName, operand, s.span));
            const onCompleteCallback = {
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
            states[currentStateIdx].push({
                kind: "IfStmt",
                condition: makeCall("__hkd_is_rejected", [makeIdent(futName, s.span)], s.span),
                then: {
                    kind: "BlockStmt",
                    body: [
                        {
                            kind: "ExprStmt",
                            expr: makeCall("__hkd_reject", [makeIdent("__future__", s.span), makeCall("__hkd_error", [makeIdent(futName, s.span)], s.span)], s.span),
                            span: s.span,
                        },
                        makeReturnFuture(s.span),
                    ],
                    span: s.span,
                },
                else_: null,
                span: s.span,
            });
            states[currentStateIdx].push(makeAssign("__resume_val__", makeCall("__hkd_unwrap", [makeIdent(futName, s.span)], s.span), s.span));
            states[currentStateIdx].push(makeAssign("__state__", makeInt(nextState, s.span), s.span));
            states.push([]);
            currentStateIdx = nextState;
            states[currentStateIdx].push({
                kind: "ExprStmt",
                expr: makeCall("__hkd_resolve", [makeIdent("__future__", s.span), makeIdent("__resume_val__", s.span)], s.span),
                span: s.span,
            });
            states[currentStateIdx].push(makeReturnFuture(s.span));
        }
        else if (s.kind === "ReturnStmt") {
            // return expr
            const val = s.value ?? makeNull(s.span);
            states[currentStateIdx].push({
                kind: "ExprStmt",
                expr: makeCall("__hkd_resolve", [makeIdent("__future__", s.span), val], s.span),
                span: s.span,
            });
            states[currentStateIdx].push(makeReturnFuture(s.span));
        }
        else if (s.kind === "VarDeclStmt") {
            // Standard `let x = expr;` -> since `x` is hoisted to outer scope, convert to `x = expr;`
            if (s.initializer) {
                states[currentStateIdx].push(makeAssign(s.name, s.initializer, s.span));
            }
        }
        else {
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
    const stepBody = [];
    for (let sIdx = 0; sIdx < states.length; sIdx++) {
        const cond = {
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
    const outerBody = [];
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
    const stepFnDecl = {
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
function desugarAsyncFunctionExpr(expr) {
    const dummyDecl = {
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
//# sourceMappingURL=async_lowering.js.map