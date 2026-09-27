"use strict";
/**
 * HKD Virtual Machine
 *
 * A stack-based bytecode interpreter.
 *
 * Execution model:
 *   - Value stack (up to MAX_STACK_DEPTH values)
 *   - Call frame stack (up to MAX_CALL_DEPTH frames)
 *   - Each call frame has: chunk, ip, base pointer (into value stack)
 *   - Globals stored in a Map<string, HkdValue>
 *
 * Memory:
 *   - Values are JS primitives or plain objects — GC is handled by V8
 *   - Upvalues (closures) hold shared mutable references
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VmError = exports.VM = void 0;
const chunk_js_1 = require("../bytecode/chunk.js");
const index_js_1 = require("../errors/index.js");
// ─── VM configuration ─────────────────────────────────────────────────────────
const MAX_STACK_DEPTH = 2048;
const MAX_CALL_DEPTH = 512;
// ─── VM ───────────────────────────────────────────────────────────────────────
class VM {
    stack = [];
    frames = [];
    globals = new Map();
    output;
    dbg = null;
    isPaused = false;
    futureCallbacks = new WeakMap();
    callbackQueue = [];
    isDispatchingCallbacks = false;
    dispatchCallback(cb, args) {
        this.callbackQueue.push([cb, args]);
        if (this.isDispatchingCallbacks)
            return;
        this.isDispatchingCallbacks = true;
        try {
            while (this.callbackQueue.length > 0) {
                const [nextCb, nextArgs] = this.callbackQueue.shift();
                this.runCallable(nextCb, nextArgs);
            }
        }
        finally {
            this.isDispatchingCallbacks = false;
        }
    }
    constructor(output = (s) => process.stdout.write(s + "\n")) {
        this.output = output;
        this.registerBuiltins();
    }
    setDebugger(dbg) {
        this.dbg = dbg;
    }
    // ── Public API ─────────────────────────────────────────────────────────────
    run(chunk) {
        // Wrap top-level script in a synthetic closure
        const scriptFn = {
            type: "function",
            name: "<script>",
            arity: 0,
            chunk,
            upvalueCount: 0,
        };
        const closure = {
            type: "closure",
            fn: scriptFn,
            upvalues: [],
        };
        this.pushFrame(closure, 0);
        try {
            return this.execute();
        }
        catch (e) {
            const code = (e instanceof VmError) ? e.code : index_js_1.ErrorCode.E405;
            const backtrace = [];
            for (let i = this.frames.length - 1; i >= 0; i--) {
                const frame = this.frames[i];
                const ip = frame.ip;
                const line = (ip > 0 && ip - 1 < frame.chunk.lines.length) ? frame.chunk.lines[ip - 1] : 0;
                backtrace.push(`  at ${frame.closure?.fn.name ?? "<unknown>"} (line: ${line})`);
            }
            const fullMessage = (e?.message || String(e)) + (backtrace.length > 0 ? "\n" + backtrace.join("\n") : "");
            return { ok: false, error: fullMessage, code };
        }
    }
    /** Register a native function in the global scope. */
    defineNative(name, arity, fn) {
        const native = {
            type: "native",
            name,
            arity,
            call: fn,
        };
        this.globals.set(name, native);
    }
    /** Read a global value. */
    getGlobal(name) {
        return this.globals.get(name);
    }
    /** Set a global value. */
    setGlobal(name, value) {
        this.globals.set(name, value);
    }
    resume() {
        this.isPaused = false;
        return this.execute();
    }
    runCallable(callee, args) {
        if (!callee || typeof callee !== "object") {
            throw new VmError("Cannot call non-function", index_js_1.ErrorCode.E408);
        }
        const c = callee;
        if (c.type === "native") {
            return c.call(args);
        }
        if (c.type === "closure" || c.type === "function") {
            const targetFrames = this.frames.length;
            this.push(callee);
            for (const a of args)
                this.push(a);
            this.callValue(callee, args.length);
            const res = this.execute(targetFrames);
            if (!res.ok) {
                throw new VmError(res.error, res.code);
            }
            return res.value;
        }
        throw new VmError("Cannot call non-function", index_js_1.ErrorCode.E408);
    }
    getCallFrames() {
        return this.frames.map((f, idx) => ({
            name: f.closure?.fn.name || "<script>",
            line: (f.ip > 0 && f.ip - 1 < f.chunk.lines.length) ? f.chunk.lines[f.ip - 1] : (f.chunk.lines[f.ip] || 0),
            frameIndex: idx,
        }));
    }
    getFrameLocals(frameIndex) {
        if (frameIndex < 0 || frameIndex >= this.frames.length)
            return [];
        const frame = this.frames[frameIndex];
        const nextBase = frameIndex + 1 < this.frames.length ? this.frames[frameIndex + 1].base : this.stack.length;
        const locals = [];
        for (let i = frame.base; i < nextBase; i++) {
            locals.push({
                name: `slot_${i - frame.base}`,
                value: this.stack[i],
            });
        }
        return locals;
    }
    getAllGlobals() {
        const list = [];
        for (const [k, v] of this.globals.entries()) {
            list.push({ name: k, value: v });
        }
        return list;
    }
    getConstant(frame, idx) {
        if (idx < 0 || idx >= frame.chunk.constants.length) {
            throw new VmError(`Bytecode safety violation: constant index ${idx} out of bounds (constant pool size: ${frame.chunk.constants.length})`, index_js_1.ErrorCode.E401);
        }
        return frame.chunk.constants[idx];
    }
    // ── Main execution loop ────────────────────────────────────────────────────
    execute(targetFrames = 0) {
        while (true) {
            const frame = this.currentFrame();
            const currentIp = frame.ip;
            const line = frame.chunk.lines[currentIp] || 0;
            if (this.dbg) {
                const action = this.dbg.onBeforeInstruction?.(this, frame, frame.chunk.code[currentIp], line);
                if (action === "pause") {
                    this.isPaused = true;
                    return { ok: true, value: null };
                }
            }
            const op = frame.chunk.readByte(frame.ip++);
            switch (op) {
                // ── Stack ─────────────────────────────────────────────────────────
                case 1 /* Op.LoadConst */: {
                    const idx = this.readU16();
                    this.push(this.getConstant(frame, idx));
                    break;
                }
                case 2 /* Op.LoadNull */:
                    this.push(null);
                    break;
                case 3 /* Op.LoadTrue */:
                    this.push(true);
                    break;
                case 4 /* Op.LoadFalse */:
                    this.push(false);
                    break;
                case 5 /* Op.Pop */:
                    this.pop();
                    break;
                case 6 /* Op.Dup */:
                    this.push(this.peek(0));
                    break;
                // ── Locals ────────────────────────────────────────────────────────
                case 16 /* Op.LoadLocal */: {
                    const slot = this.readU16();
                    this.push(this.stack[frame.base + slot]);
                    break;
                }
                case 17 /* Op.StoreLocal */: {
                    const slot = this.readU16();
                    this.stack[frame.base + slot] = this.peek(0);
                    break;
                }
                case 18 /* Op.DefineLocal */: {
                    const slot = this.readU16();
                    this.stack[frame.base + slot] = this.pop();
                    break;
                }
                // ── Globals ───────────────────────────────────────────────────────
                case 19 /* Op.LoadGlobal */: {
                    const nameIdx = this.readU16();
                    const name = this.getConstant(frame, nameIdx);
                    if (!this.globals.has(name)) {
                        throw new VmError(`Undefined variable \`${name}\``, index_js_1.ErrorCode.E301);
                    }
                    this.push(this.globals.get(name));
                    break;
                }
                case 20 /* Op.StoreGlobal */: {
                    const nameIdx = this.readU16();
                    const name = this.getConstant(frame, nameIdx);
                    this.globals.set(name, this.peek(0));
                    break;
                }
                case 21 /* Op.DefineGlobal */: {
                    const nameIdx = this.readU16();
                    const name = this.getConstant(frame, nameIdx);
                    this.globals.set(name, this.pop());
                    break;
                }
                // ── Upvalues ──────────────────────────────────────────────────────
                case 22 /* Op.LoadUpvalue */: {
                    const idx = this.readU16();
                    const uv = frame.closure?.upvalues[idx];
                    this.push(uv ? uv.value : null);
                    break;
                }
                case 23 /* Op.StoreUpvalue */: {
                    const idx = this.readU16();
                    const uv = frame.closure?.upvalues[idx];
                    if (uv)
                        uv.value = this.peek(0);
                    break;
                }
                case 24 /* Op.CloseUpvalue */: {
                    // Close upvalue — value already captured
                    this.pop();
                    break;
                }
                // ── Arithmetic ────────────────────────────────────────────────────
                case 32 /* Op.Add */: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === "string" || typeof b === "string") {
                        this.push(this.hkdToString(a) + this.hkdToString(b));
                    }
                    else if (typeof a === "number" && typeof b === "number") {
                        this.push(a + b);
                    }
                    else {
                        throw new VmError(`Cannot add ${typeof a} and ${typeof b}`, index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case 33 /* Op.Sub */:
                    this.numericOp("-");
                    break;
                case 34 /* Op.Mul */:
                    this.numericOp("*");
                    break;
                case 35 /* Op.Div */: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === "number" && typeof b === "number") {
                        if (b === 0)
                            throw new VmError("Division by zero", index_js_1.ErrorCode.E401);
                        this.push(a / b);
                    }
                    else {
                        throw new VmError("Division requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case 36 /* Op.Mod */: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === "number" && typeof b === "number") {
                        if (b === 0)
                            throw new VmError("Modulo by zero", index_js_1.ErrorCode.E401);
                        this.push(a % b);
                    }
                    else {
                        throw new VmError("Modulo requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case 37 /* Op.Pow */: {
                    const b = this.pop();
                    const a = this.pop();
                    if (typeof a === "number" && typeof b === "number") {
                        this.push(Math.pow(a, b));
                    }
                    else {
                        throw new VmError("Exponentiation requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case 38 /* Op.Neg */: {
                    const a = this.pop();
                    if (typeof a === "number")
                        this.push(-a);
                    else
                        throw new VmError("Negation requires a number", index_js_1.ErrorCode.E405);
                    break;
                }
                // ── Comparison ────────────────────────────────────────────────────
                case 48 /* Op.Eq */: {
                    const b = this.pop(), a = this.pop();
                    this.push(this.hkdEquals(a, b));
                    break;
                }
                case 49 /* Op.Ne */: {
                    const b = this.pop(), a = this.pop();
                    this.push(!this.hkdEquals(a, b));
                    break;
                }
                case 50 /* Op.Lt */: {
                    const b = this.pop(), a = this.pop();
                    this.push(this.compareValues(a, b) < 0);
                    break;
                }
                case 51 /* Op.Le */: {
                    const b = this.pop(), a = this.pop();
                    this.push(this.compareValues(a, b) <= 0);
                    break;
                }
                case 52 /* Op.Gt */: {
                    const b = this.pop(), a = this.pop();
                    this.push(this.compareValues(a, b) > 0);
                    break;
                }
                case 53 /* Op.Ge */: {
                    const b = this.pop(), a = this.pop();
                    this.push(this.compareValues(a, b) >= 0);
                    break;
                }
                // ── Logical ───────────────────────────────────────────────────────
                case 64 /* Op.Not */:
                    this.push(!this.isTruthy(this.pop()));
                    break;
                // ── Bitwise ───────────────────────────────────────────────────────
                case 65 /* Op.BitAnd */: {
                    const b = this.popInt(), a = this.popInt();
                    this.push(a & b);
                    break;
                }
                case 66 /* Op.BitOr */: {
                    const b = this.popInt(), a = this.popInt();
                    this.push(a | b);
                    break;
                }
                case 67 /* Op.BitXor */: {
                    const b = this.popInt(), a = this.popInt();
                    this.push(a ^ b);
                    break;
                }
                case 68 /* Op.BitNot */:
                    this.push(~this.popInt());
                    break;
                case 69 /* Op.Shl */: {
                    const b = this.popInt(), a = this.popInt();
                    this.push(a << b);
                    break;
                }
                case 70 /* Op.Shr */: {
                    const b = this.popInt(), a = this.popInt();
                    this.push(a >> b);
                    break;
                }
                // ── Jumps ─────────────────────────────────────────────────────────
                case 80 /* Op.Jump */: {
                    const offset = frame.chunk.readI16(frame.ip);
                    frame.ip += 2 + offset;
                    break;
                }
                case 81 /* Op.JumpFalse */: {
                    const offset = frame.chunk.readI16(frame.ip);
                    frame.ip += 2;
                    if (!this.isTruthy(this.peek(0)))
                        frame.ip += offset;
                    break;
                }
                case 82 /* Op.JumpTrue */: {
                    const offset = frame.chunk.readI16(frame.ip);
                    frame.ip += 2;
                    if (this.isTruthy(this.peek(0)))
                        frame.ip += offset;
                    break;
                }
                case 83 /* Op.JumpNull */: {
                    const offset = frame.chunk.readI16(frame.ip);
                    frame.ip += 2;
                    if (this.peek(0) === null)
                        frame.ip += offset;
                    break;
                }
                // ── Functions ─────────────────────────────────────────────────────
                case 96 /* Op.Call */: {
                    const argc = frame.chunk.readByte(frame.ip++);
                    const callee = this.peek(argc);
                    // Self-tail call optimization
                    if (frame.ip < frame.chunk.code.length && frame.chunk.code[frame.ip] === 97 /* Op.Return */) {
                        const isSelf = (callee && typeof callee === "object" && "type" in callee && (callee.type === "function" ? callee.chunk === frame.chunk : callee.type === "closure" ? callee.fn.chunk === frame.chunk : false));
                        const arity = (callee && typeof callee === "object" && "type" in callee && (callee.type === "function" ? callee.arity : callee.type === "closure" ? callee.fn.arity : -1));
                        if (isSelf && arity === argc) {
                            const argsStart = this.stack.length - argc;
                            for (let i = 0; i < argc; i++) {
                                this.stack[frame.base + i] = this.stack[argsStart + i];
                            }
                            this.stack.length = frame.base + argc;
                            frame.ip = 0;
                            break;
                        }
                    }
                    this.callValue(callee, argc);
                    break;
                }
                case 97 /* Op.Return */: {
                    const returnValue = this.pop();
                    const returnFrame = this.frames.pop();
                    // Restore stack to before the call
                    this.stack.length = Math.max(0, returnFrame.base - 1);
                    if (this.frames.length === targetFrames) {
                        return { ok: true, value: returnValue };
                    }
                    this.push(returnValue);
                    break;
                }
                case 98 /* Op.MakeClosure */: {
                    const fnIdx = this.readU16();
                    const upCount = frame.chunk.readByte(frame.ip++);
                    const fn = this.getConstant(frame, fnIdx);
                    const upvalues = [];
                    for (let i = 0; i < upCount; i++) {
                        const isLocal = frame.chunk.readByte(frame.ip++) === 1;
                        const idx = this.readU16();
                        if (isLocal) {
                            upvalues.push({
                                value: this.stack[frame.base + idx],
                                closed: false,
                                stackIndex: idx,
                            });
                        }
                        else {
                            upvalues.push(frame.closure?.upvalues[idx] ?? {
                                value: null,
                                closed: true,
                                stackIndex: -1,
                            });
                        }
                    }
                    const closure = { type: "closure", fn, upvalues };
                    this.push(closure);
                    break;
                }
                // ── Arrays ────────────────────────────────────────────────────────
                case 112 /* Op.MakeArray */: {
                    const n = this.readU16();
                    const elements = this.stack.splice(this.stack.length - n, n);
                    const arr = { type: "array", elements };
                    this.push(arr);
                    break;
                }
                case 113 /* Op.GetIndex */: {
                    const index = this.pop();
                    const obj = this.pop();
                    this.push(this.getIndex(obj, index));
                    break;
                }
                case 114 /* Op.SetIndex */: {
                    const index = this.pop();
                    const obj = this.pop();
                    const value = this.peek(0); // leave value on stack
                    this.setIndex(obj, index, value);
                    break;
                }
                case 115 /* Op.ArrayLen */: {
                    const arr = this.pop();
                    if (arr?.type === "array") {
                        this.push(arr.elements.length);
                    }
                    else if (typeof arr === "string") {
                        this.push(arr.length);
                    }
                    else {
                        throw new VmError("len() requires an array or string", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                // ── Objects ───────────────────────────────────────────────────────
                case 128 /* Op.MakeObject */: {
                    const n = this.readU16();
                    const pairs = this.stack.splice(this.stack.length - n * 2, n * 2);
                    const fields = new Map();
                    for (let i = 0; i < pairs.length; i += 2) {
                        fields.set(pairs[i], pairs[i + 1]);
                    }
                    const obj = { type: "object", fields };
                    this.push(obj);
                    break;
                }
                case 129 /* Op.GetField */: {
                    const nameIdx = this.readU16();
                    const fieldName = this.getConstant(frame, nameIdx);
                    const obj = this.pop();
                    this.push(this.getField(obj, fieldName));
                    break;
                }
                case 130 /* Op.SetField */: {
                    const nameIdx = this.readU16();
                    const fieldName = this.getConstant(frame, nameIdx);
                    const obj = this.pop();
                    const value = this.peek(0); // leave on stack
                    if (obj?.type === "object") {
                        obj.fields.set(fieldName, value);
                    }
                    else {
                        throw new VmError(`Cannot set field on ${typeof obj}`, index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                // ── Iteration ─────────────────────────────────────────────────────
                case 144 /* Op.MakeIter */: {
                    const value = this.pop();
                    const iter = this.makeIterator(value);
                    this.push(iter);
                    break;
                }
                case 145 /* Op.IterNext */: {
                    const offset = frame.chunk.readI16(frame.ip);
                    frame.ip += 2;
                    const iter = this.peek(0);
                    if (!iter || iter.type !== "iterator") {
                        throw new VmError("IterNext requires an iterator", index_js_1.ErrorCode.E405);
                    }
                    const result = iter.next();
                    if (result.done) {
                        // Pop the iterator and jump past the loop
                        this.pop();
                        frame.ip += offset;
                    }
                    else {
                        this.push(result.value);
                    }
                    break;
                }
                // ── String ────────────────────────────────────────────────────────
                case 160 /* Op.Concat */: {
                    const n = this.readU16();
                    const parts = this.stack.splice(this.stack.length - n, n);
                    this.push(parts.map((p) => this.hkdToString(p)).join(""));
                    break;
                }
                // ── Debug ─────────────────────────────────────────────────────────
                case 240 /* Op.LineInfo */: {
                    this.readU16(); // consume line number (used by debugger, ignore here)
                    break;
                }
                case 255 /* Op.Halt */:
                    return { ok: true, value: this.stack.length > 0 ? this.pop() : null };
                default:
                    throw new VmError(`Unknown opcode: 0x${op.toString(16)}`, index_js_1.ErrorCode.E503);
            }
        }
    }
    // ── Call helpers ──────────────────────────────────────────────────────────
    callValue(callee, argc) {
        if (callee === null || callee === undefined) {
            throw new VmError("Cannot call null", index_js_1.ErrorCode.E408);
        }
        const c = callee;
        if (c.type === "native") {
            const native = c;
            if (native.arity >= 0 && native.arity !== argc) {
                throw new VmError(`${native.name}() expects ${native.arity} argument(s), got ${argc}`, index_js_1.ErrorCode.E307);
            }
            const args = this.stack.splice(this.stack.length - argc - 1, argc + 1);
            const result = native.call(args.slice(1)); // args[0] is the function itself
            this.push(result);
            return;
        }
        if (c.type === "function") {
            const fn = c;
            const closure = { type: "closure", fn, upvalues: [] };
            const base = this.stack.length - argc;
            this.pushFrame(closure, base);
            return;
        }
        if (c.type === "closure") {
            const closure = c;
            if (closure.fn.arity !== argc) {
                throw new VmError(`${closure.fn.name}() expects ${closure.fn.arity} argument(s), got ${argc}`, index_js_1.ErrorCode.E307);
            }
            const base = this.stack.length - argc;
            this.pushFrame(closure, base);
            return;
        }
        throw new VmError(`\`${(0, chunk_js_1.formatValue)(callee)}\` is not callable`, index_js_1.ErrorCode.E408);
    }
    pushFrame(closure, base) {
        if (this.frames.length >= MAX_CALL_DEPTH) {
            throw new VmError("Stack overflow (call depth limit reached)", index_js_1.ErrorCode.E404);
        }
        this.frames.push({
            closure,
            chunk: closure.fn.chunk,
            ip: 0,
            base,
            openUpvalues: [],
        });
    }
    // ── Stack helpers ─────────────────────────────────────────────────────────
    push(value) {
        if (this.stack.length >= MAX_STACK_DEPTH) {
            throw new VmError("Stack overflow", index_js_1.ErrorCode.E404);
        }
        this.stack.push(value);
    }
    pop() {
        if (this.stack.length === 0) {
            throw new VmError("Stack underflow", index_js_1.ErrorCode.E502);
        }
        return this.stack.pop();
    }
    peek(distance) {
        return this.stack[this.stack.length - 1 - distance];
    }
    popInt() {
        const v = this.pop();
        if (typeof v !== "number")
            throw new VmError("Expected integer", index_js_1.ErrorCode.E405);
        return v | 0;
    }
    currentFrame() {
        return this.frames[this.frames.length - 1];
    }
    readU16() {
        const frame = this.currentFrame();
        const val = frame.chunk.readU16(frame.ip);
        frame.ip += 2;
        return val;
    }
    // ── Value operations ──────────────────────────────────────────────────────
    numericOp(op) {
        const b = this.pop(), a = this.pop();
        if (typeof a !== "number" || typeof b !== "number") {
            throw new VmError(`Operator '${op}' requires numbers`, index_js_1.ErrorCode.E405);
        }
        switch (op) {
            case "-":
                this.push(a - b);
                break;
            case "*":
                this.push(a * b);
                break;
        }
    }
    isTruthy(v) {
        if (v === null || v === false)
            return false;
        if (v === 0 || v === "")
            return false;
        return true;
    }
    hkdEquals(a, b) {
        if (a === null && b === null)
            return true;
        if (a === null || b === null)
            return false;
        if (typeof a !== typeof b)
            return false;
        if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") {
            return a === b;
        }
        // Array equality: structural
        if (a.type === "array" && b.type === "array") {
            const aa = a.elements;
            const ba = b.elements;
            if (aa.length !== ba.length)
                return false;
            return aa.every((v, i) => this.hkdEquals(v, ba[i]));
        }
        return a === b; // reference equality for objects and functions
    }
    compareValues(a, b) {
        if (typeof a === "number" && typeof b === "number")
            return a - b;
        if (typeof a === "string" && typeof b === "string")
            return a < b ? -1 : a > b ? 1 : 0;
        throw new VmError(`Cannot compare ${typeof a} and ${typeof b}`, index_js_1.ErrorCode.E405);
    }
    hkdToString(v) {
        if (v === null)
            return "null";
        if (typeof v === "boolean")
            return String(v);
        if (typeof v === "number") {
            // Format integers without decimal point
            if (Number.isInteger(v))
                return String(v);
            return String(v);
        }
        if (typeof v === "string")
            return v;
        return (0, chunk_js_1.formatValue)(v);
    }
    getIndex(obj, index) {
        if (obj?.type === "array") {
            const arr = obj;
            if (typeof index !== "number")
                throw new VmError("Array index must be an Int", index_js_1.ErrorCode.E405);
            const i = index < 0 ? arr.elements.length + index : index;
            if (i < 0 || i >= arr.elements.length) {
                throw new VmError(`Index ${index} out of bounds for array of length ${arr.elements.length}`, index_js_1.ErrorCode.E402);
            }
            return arr.elements[i];
        }
        if (typeof obj === "string") {
            if (typeof index !== "number")
                throw new VmError("String index must be an Int", index_js_1.ErrorCode.E405);
            return obj[index] ?? null;
        }
        if (obj?.type === "object") {
            if (typeof index !== "string")
                throw new VmError("Object key must be a String", index_js_1.ErrorCode.E405);
            return obj.fields.get(index) ?? null;
        }
        throw new VmError(`Cannot index ${typeof obj}`, index_js_1.ErrorCode.E405);
    }
    setIndex(obj, index, value) {
        if (obj?.type === "array") {
            const arr = obj;
            if (typeof index !== "number")
                throw new VmError("Array index must be an Int", index_js_1.ErrorCode.E405);
            arr.elements[index] = value;
            return;
        }
        if (obj?.type === "object") {
            if (typeof index !== "string")
                throw new VmError("Object key must be a String", index_js_1.ErrorCode.E405);
            obj.fields.set(index, value);
            return;
        }
        throw new VmError(`Cannot index-assign ${typeof obj}`, index_js_1.ErrorCode.E405);
    }
    getField(obj, field) {
        if (obj?.type === "object") {
            const val = obj.fields.get(field);
            if (val !== undefined)
                return val;
            const typeName = obj.fields.get("__type__");
            if (typeof typeName === "string") {
                const methodGlobal = this.globals.get(`${typeName}__${field}`);
                if (methodGlobal) {
                    return {
                        type: "native",
                        name: `${typeName}.${field}`,
                        arity: -1,
                        call: (args) => {
                            return this.runCallable(methodGlobal, [obj, ...args]);
                        },
                    };
                }
            }
            return null;
        }
        if (obj?.type === "array") {
            // Array methods
            if (field === "length")
                return obj.elements.length;
            if (field === "push") {
                const arr = obj;
                return {
                    type: "native",
                    name: "push",
                    arity: 1,
                    call: (args) => { arr.elements.push(args[0]); return null; },
                };
            }
            if (field === "pop") {
                const arr = obj;
                return {
                    type: "native",
                    name: "pop",
                    arity: 0,
                    call: () => arr.elements.pop() ?? null,
                };
            }
            if (field === "join") {
                const arr = obj;
                return {
                    type: "native",
                    name: "join",
                    arity: 1,
                    call: (args) => arr.elements.map((e) => this.hkdToString(e)).join(args[0] ?? ""),
                };
            }
        }
        if (typeof obj === "string") {
            if (field === "length")
                return obj.length;
            if (field === "upper")
                return { type: "native", name: "upper", arity: 0, call: () => obj.toUpperCase() };
            if (field === "lower")
                return { type: "native", name: "lower", arity: 0, call: () => obj.toLowerCase() };
            if (field === "trim")
                return { type: "native", name: "trim", arity: 0, call: () => obj.trim() };
            if (field === "split")
                return { type: "native", name: "split", arity: 1, call: (a) => ({ type: "array", elements: obj.split(a[0]) }) };
            if (field === "contains")
                return { type: "native", name: "contains", arity: 1, call: (a) => obj.includes(a[0]) };
            if (field === "starts_with")
                return { type: "native", name: "starts_with", arity: 1, call: (a) => obj.startsWith(a[0]) };
            if (field === "ends_with")
                return { type: "native", name: "ends_with", arity: 1, call: (a) => obj.endsWith(a[0]) };
            if (field === "replace")
                return { type: "native", name: "replace", arity: 2, call: (a) => obj.replace(a[0], a[1]) };
        }
        return null;
    }
    makeIterator(value) {
        if (value?.type === "array") {
            const elements = value.elements;
            let i = 0;
            return {
                type: "iterator",
                next: () => {
                    if (i < elements.length)
                        return { value: elements[i++], done: false };
                    return { value: null, done: true };
                },
            };
        }
        if (typeof value === "string") {
            const chars = [...value];
            let i = 0;
            return {
                type: "iterator",
                next: () => {
                    if (i < chars.length)
                        return { value: chars[i++], done: false };
                    return { value: null, done: true };
                },
            };
        }
        throw new VmError(`Value is not iterable`, index_js_1.ErrorCode.E405);
    }
    // ── Built-in functions ────────────────────────────────────────────────────
    registerBuiltins() {
        const output = this.output;
        this.defineNative("print", -1, (args) => {
            output(args.map((a) => this.hkdToString(a)).join(" "));
            return null;
        });
        this.defineNative("println", -1, (args) => {
            output(args.map((a) => this.hkdToString(a)).join(" "));
            return null;
        });
        this.defineNative("input", 1, (_args) => {
            // In non-REPL mode, input is a no-op returning empty string
            // The REPL overrides this
            return "";
        });
        this.defineNative("len", 1, (args) => {
            const v = args[0];
            if (v?.type === "array")
                return v.elements.length;
            if (typeof v === "string")
                return v.length;
            if (v?.type === "object")
                return v.fields.size;
            throw new VmError(`len() not supported for ${typeof v}`, index_js_1.ErrorCode.E405);
        });
        this.defineNative("type_of", 1, (args) => {
            const v = args[0];
            if (v === null)
                return "null";
            if (typeof v === "boolean")
                return "Bool";
            if (typeof v === "number")
                return Number.isInteger(v) ? "Int" : "Float";
            if (typeof v === "string")
                return "String";
            if (v?.type === "array")
                return "Array";
            if (v?.type === "function")
                return "Function";
            if (v?.type === "closure")
                return "Function";
            if (v?.type === "native")
                return "Function";
            return "Object";
        });
        this.defineNative("to_string", 1, (args) => this.hkdToString(args[0]));
        this.defineNative("to_int", 1, (args) => {
            const v = args[0];
            if (typeof v === "number")
                return Math.trunc(v);
            if (typeof v === "string") {
                const n = parseInt(v, 10);
                if (isNaN(n))
                    throw new VmError(`Cannot convert "${v}" to Int`, index_js_1.ErrorCode.E405);
                return n;
            }
            if (typeof v === "boolean")
                return v ? 1 : 0;
            throw new VmError(`Cannot convert to Int`, index_js_1.ErrorCode.E405);
        });
        this.defineNative("to_float", 1, (args) => {
            const v = args[0];
            if (typeof v === "number")
                return v;
            if (typeof v === "string") {
                const n = parseFloat(v);
                if (isNaN(n))
                    throw new VmError(`Cannot convert "${v}" to Float`, index_js_1.ErrorCode.E405);
                return n;
            }
            throw new VmError(`Cannot convert to Float`, index_js_1.ErrorCode.E405);
        });
        this.defineNative("to_bool", 1, (args) => this.isTruthy(args[0]));
        this.defineNative("exit", 1, (args) => {
            process.exit(typeof args[0] === "number" ? args[0] : 0);
        });
        this.defineNative("range", 2, (args) => {
            const start = args[0];
            const end = args[1];
            const elements = [];
            for (let i = start; i < end; i++)
                elements.push(i);
            return { type: "array", elements };
        });
        this.defineNative("panic", 1, (args) => {
            throw new VmError(this.hkdToString(args[0]), index_js_1.ErrorCode.E405);
        });
        // Internal built-ins used by the compiler
        this.defineNative("__assert__", 2, (args) => {
            if (!this.isTruthy(args[0])) {
                throw new VmError(`Assertion failed: ${this.hkdToString(args[1])}`, index_js_1.ErrorCode.E405);
            }
            return null;
        });
        this.defineNative("assert", -1, (args) => {
            if (!this.isTruthy(args[0])) {
                const msg = args[1] ? this.hkdToString(args[1]) : "Assertion failed";
                throw new VmError(msg, index_js_1.ErrorCode.E405);
            }
            return null;
        });
        // Test registration (overridden by test runner)
        this.defineNative("__register_test__", 2, (_args) => null);
        // Module import
        this.defineNative("__import__", 1, (_args) => {
            // Resolved by the runtime module loader
            return null;
        });
        // Async / Future runtime primitives (RFC-004)
        this.defineNative("__hkd_future", 1, (args) => {
            const initVal = args[0] !== undefined ? args[0] : null;
            const isResolved = initVal !== null && initVal !== undefined;
            const fields = new Map();
            fields.set("__type__", "Future");
            fields.set("state", isResolved ? "resolved" : "pending");
            fields.set("value", initVal);
            fields.set("error", null);
            const fut = { type: "object", fields };
            this.futureCallbacks.set(fut, []);
            return fut;
        });
        this.defineNative("__hkd_is_pending", 1, (args) => {
            const v = args[0];
            if (v && typeof v === "object" && v.type === "object") {
                return v.fields.get("state") === "pending";
            }
            return false;
        });
        this.defineNative("__hkd_is_rejected", 1, (args) => {
            const v = args[0];
            if (v && typeof v === "object" && v.type === "object") {
                return v.fields.get("state") === "rejected";
            }
            return false;
        });
        this.defineNative("__hkd_error", 1, (args) => {
            const v = args[0];
            if (v && typeof v === "object" && v.type === "object") {
                return v.fields.get("error") ?? null;
            }
            return null;
        });
        this.defineNative("__hkd_unwrap", 1, (args) => {
            const v = args[0];
            if (v && typeof v === "object" && v.type === "object" && v.fields.get("__type__") === "Future") {
                const obj = v;
                const state = obj.fields.get("state");
                if (state === "rejected") {
                    const err = obj.fields.get("error");
                    throw new Error(`TaskFailure: Future rejected with error: ${err !== null ? String(err) : "Unknown error"}`);
                }
                return obj.fields.get("value") ?? null;
            }
            return v;
        });
        this.defineNative("__hkd_resolve", 2, (args) => {
            const fut = args[0];
            const val = args[1] !== undefined ? args[1] : null;
            if (fut && typeof fut === "object" && fut.type === "object") {
                const obj = fut;
                if (obj.fields.get("state") !== "pending") {
                    return fut; // Terminal transition: Resolved -> no transition, Rejected -> no transition
                }
                obj.fields.set("state", "resolved");
                obj.fields.set("value", val);
                const cbs = this.futureCallbacks.get(obj);
                if (cbs) {
                    this.futureCallbacks.delete(obj);
                    for (const cb of cbs) {
                        this.dispatchCallback(cb, [val]);
                    }
                }
            }
            return fut;
        });
        this.defineNative("__hkd_reject", 2, (args) => {
            const fut = args[0];
            const err = args[1] !== undefined ? args[1] : null;
            if (fut && typeof fut === "object" && fut.type === "object") {
                const obj = fut;
                if (obj.fields.get("state") !== "pending") {
                    return fut; // Terminal transition: Resolved -> no transition, Rejected -> no transition
                }
                obj.fields.set("state", "rejected");
                obj.fields.set("error", err);
                const cbs = this.futureCallbacks.get(obj);
                if (cbs) {
                    this.futureCallbacks.delete(obj);
                    for (const cb of cbs) {
                        this.dispatchCallback(cb, [null]);
                    }
                }
            }
            return fut;
        });
        this.defineNative("__hkd_on_complete", 2, (args) => {
            const fut = args[0];
            const cb = args[1];
            if (fut && typeof fut === "object" && fut.type === "object") {
                const obj = fut;
                const state = obj.fields.get("state");
                if (state === "resolved") {
                    this.dispatchCallback(cb, [obj.fields.get("value") ?? null]);
                }
                else if (state === "rejected") {
                    this.dispatchCallback(cb, [null]);
                }
                else {
                    let cbs = this.futureCallbacks.get(obj);
                    if (!cbs) {
                        cbs = [];
                        this.futureCallbacks.set(obj, cbs);
                    }
                    cbs.push(cb);
                }
            }
            return null;
        });
    }
}
exports.VM = VM;
// ─── VM Error ─────────────────────────────────────────────────────────────────
class VmError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "VmError";
    }
}
exports.VmError = VmError;
//# sourceMappingURL=vm.js.map