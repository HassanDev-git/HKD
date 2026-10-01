"use strict";
/**
 * HKD Register Virtual Machine (Phase 9C Architecture Experiment)
 *
 * A 3-address virtual register machine that executes RegisterChunk instructions.
 *
 * Register Model:
 *   - Each CallFrame has a private registers array `registers: HkdValue[]`
 *   - Local variables occupy registers `0 .. numLocals - 1`
 *   - Function arguments occupy registers `0 .. arity - 1`
 *   - Temporaries occupy registers `>= numLocals`
 *   - Eliminates push/pop stack pointer adjustments and intermediate stack writes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegisterVM = void 0;
const chunk_js_1 = require("../bytecode/chunk.js");
const register_chunk_js_1 = require("../bytecode/register_chunk.js");
const register_lowering_js_1 = require("../bytecode/register_lowering.js");
const index_js_1 = require("../errors/index.js");
const vm_js_1 = require("./vm.js");
const MAX_CALL_DEPTH = 512;
const EMPTY_ARGS = [];
class RegisterVM {
    frames = [];
    globals = new Map();
    globalCells = new Map();
    output;
    futureCallbacks = new WeakMap();
    callbackQueue = [];
    isDispatchingCallbacks = false;
    regArrayPool = [];
    framePool = [];
    constructor(output = (s) => process.stdout.write(s + "\n")) {
        this.output = output;
        this.registerBuiltins();
    }
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
    runCallable(callee, args) {
        if (!callee || typeof callee !== "object") {
            throw new vm_js_1.VmError("Cannot call non-function", index_js_1.ErrorCode.E408);
        }
        const c = callee;
        if (c.type === "native") {
            return c.call(args);
        }
        if (c.type === "closure" || c.type === "function") {
            const fn = c.type === "closure" ? c.fn : c;
            const regChunk = fn.registerChunk ?? (0, register_lowering_js_1.lowerToRegisterChunk)(fn.chunk);
            fn.registerChunk = regChunk;
            const targetFrames = this.frames.length;
            const closure = c.type === "closure" ? c : { type: "closure", fn, upvalues: [] };
            const regSize = Math.max(regChunk.registerCount + 32, 128);
            const registers = new Array(regSize);
            for (let i = 0; i < args.length; i++)
                registers[i] = args[i];
            this.pushFrame(closure, regChunk, registers, 0);
            const res = this.execute(targetFrames);
            if (!res.ok)
                throw new vm_js_1.VmError(res.error, res.code);
            return res.value;
        }
        throw new vm_js_1.VmError("Cannot call non-function", index_js_1.ErrorCode.E408);
    }
    getGlobalCell(name) {
        let cell = this.globalCells.get(name);
        if (!cell) {
            cell = { name, value: this.globals.has(name) ? this.globals.get(name) : undefined };
            this.globalCells.set(name, cell);
        }
        return cell;
    }
    defineNative(name, arity, fn, call1, call2) {
        const native = {
            type: "native",
            name,
            arity,
            call: fn,
            call1,
            call2,
        };
        this.globals.set(name, native);
        const cell = this.globalCells.get(name);
        if (cell)
            cell.value = native;
    }
    getGlobal(name) {
        const cell = this.globalCells.get(name);
        if (cell !== undefined && cell.value !== undefined)
            return cell.value;
        return this.globals.get(name);
    }
    setGlobal(name, value) {
        this.globals.set(name, value);
        const cell = this.globalCells.get(name);
        if (cell)
            cell.value = value;
    }
    getAllGlobals() {
        const map = new Map(this.globals);
        for (const [k, cell] of this.globalCells.entries()) {
            if (cell.value !== undefined)
                map.set(k, cell.value);
        }
        const list = [];
        for (const [k, v] of map.entries()) {
            list.push({ name: k, value: v });
        }
        return list;
    }
    run(chunk) {
        let regChunk;
        if (chunk instanceof register_chunk_js_1.RegisterChunk) {
            regChunk = chunk;
        }
        else {
            regChunk = (0, register_lowering_js_1.lowerToRegisterChunk)(chunk);
        }
        const scriptFn = {
            type: "function",
            name: "<script>",
            arity: 0,
            chunk: null,
            upvalueCount: 0,
        };
        scriptFn.registerChunk = regChunk;
        const closure = {
            type: "closure",
            fn: scriptFn,
            upvalues: [],
        };
        const regSize = Math.max(regChunk.registerCount + 32, 128);
        const registers = new Array(regSize);
        this.pushFrame(closure, regChunk, registers, 0);
        try {
            return this.execute(0);
        }
        catch (e) {
            const code = (e instanceof vm_js_1.VmError) ? e.code : index_js_1.ErrorCode.E405;
            const backtrace = [];
            for (let i = this.frames.length - 1; i >= 0; i--) {
                const frame = this.frames[i];
                const ip = frame.ip;
                const line = (ip > 0 && ip - 1 < frame.chunk.code.length) ? frame.chunk.code[ip - 1].line : 0;
                backtrace.push(`  at ${frame.closure?.fn.name ?? "<unknown>"} (line: ${line})`);
            }
            const fullMessage = (e?.message || String(e)) + (backtrace.length > 0 ? "\n" + backtrace.join("\n") : "");
            return { ok: false, error: fullMessage, code };
        }
    }
    pushFrame(closure, chunk, registers, destReg) {
        if (this.frames.length >= MAX_CALL_DEPTH) {
            throw new vm_js_1.VmError("Stack overflow (call depth limit reached)", index_js_1.ErrorCode.E404);
        }
        let frame;
        if (this.framePool.length > 0) {
            frame = this.framePool.pop();
            frame.closure = closure;
            frame.chunk = chunk;
            frame.ip = 0;
            frame.registers = registers;
            frame.destReg = destReg;
            frame.cells.length = 0;
        }
        else {
            frame = {
                closure,
                chunk,
                ip: 0,
                registers,
                destReg,
                cells: [],
            };
        }
        this.frames.push(frame);
    }
    execute(targetFrames = 0) {
        let frame = this.frames[this.frames.length - 1];
        let code = frame.chunk.code;
        let registers = frame.registers;
        let constants = frame.chunk.constants;
        let cells = frame.cells;
        while (true) {
            const ins = code[frame.ip++];
            switch (ins.op) {
                case register_chunk_js_1.RegOp.Nop:
                    break;
                case register_chunk_js_1.RegOp.LoadConst:
                    registers[ins.dst] = constants[ins.src1];
                    break;
                case register_chunk_js_1.RegOp.LoadImm:
                    registers[ins.dst] = ins.src1;
                    break;
                case register_chunk_js_1.RegOp.LoadNull:
                    registers[ins.dst] = null;
                    break;
                case register_chunk_js_1.RegOp.LoadTrue:
                    registers[ins.dst] = true;
                    break;
                case register_chunk_js_1.RegOp.LoadFalse:
                    registers[ins.dst] = false;
                    break;
                case register_chunk_js_1.RegOp.Move:
                    registers[ins.dst] = registers[ins.src1];
                    break;
                case register_chunk_js_1.RegOp.LoadGlobal: {
                    const idx = ins.src1;
                    let cell = cells[idx];
                    if (!cell) {
                        const name = constants[idx];
                        cell = this.getGlobalCell(name);
                        cells[idx] = cell;
                    }
                    const val = cell.value;
                    if (val === undefined && !this.globals.has(cell.name)) {
                        throw new vm_js_1.VmError(`Undefined variable \`${cell.name}\``, index_js_1.ErrorCode.E301);
                    }
                    registers[ins.dst] = val;
                    break;
                }
                case register_chunk_js_1.RegOp.StoreGlobal: {
                    const idx = ins.dst;
                    let cell = cells[idx];
                    if (!cell) {
                        const name = constants[idx];
                        cell = this.getGlobalCell(name);
                        cells[idx] = cell;
                    }
                    cell.value = registers[ins.src1];
                    break;
                }
                case register_chunk_js_1.RegOp.DefineGlobal: {
                    const idx = ins.dst;
                    let cell = cells[idx];
                    if (!cell) {
                        const name = constants[idx];
                        cell = this.getGlobalCell(name);
                        cells[idx] = cell;
                    }
                    const val = registers[ins.src1];
                    cell.value = val;
                    this.globals.set(cell.name, val);
                    break;
                }
                case register_chunk_js_1.RegOp.LoadUpvalue: {
                    const uv = frame.closure?.upvalues[ins.src1];
                    registers[ins.dst] = uv ? uv.value : null;
                    break;
                }
                case register_chunk_js_1.RegOp.StoreUpvalue: {
                    const uv = frame.closure?.upvalues[ins.dst];
                    if (uv)
                        uv.value = registers[ins.src1];
                    break;
                }
                case register_chunk_js_1.RegOp.CloseUpvalue:
                    break;
                // ── Arithmetic ───────────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.Add: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a + b;
                    }
                    else if (typeof a === "string" && typeof b === "string") {
                        registers[ins.dst] = a + b;
                    }
                    else if (typeof a === "string" || typeof b === "string") {
                        registers[ins.dst] = this.hkdToString(a) + this.hkdToString(b);
                    }
                    else {
                        throw new vm_js_1.VmError(`Cannot add ${typeof a} and ${typeof b}`, index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Sub: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a - b;
                    }
                    else {
                        throw new vm_js_1.VmError("Operator '-' requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Mul: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a * b;
                    }
                    else {
                        throw new vm_js_1.VmError("Operator '*' requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Div: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        if (b === 0)
                            throw new vm_js_1.VmError("Division by zero", index_js_1.ErrorCode.E401);
                        registers[ins.dst] = a / b;
                    }
                    else {
                        throw new vm_js_1.VmError("Division requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Mod: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        if (b === 0)
                            throw new vm_js_1.VmError("Modulo by zero", index_js_1.ErrorCode.E401);
                        registers[ins.dst] = a % b;
                    }
                    else {
                        throw new vm_js_1.VmError("Modulo requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Pow: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = Math.pow(a, b);
                    }
                    else {
                        throw new vm_js_1.VmError("Exponentiation requires numbers", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Neg: {
                    const a = registers[ins.src1];
                    if (typeof a === "number") {
                        registers[ins.dst] = -a;
                    }
                    else {
                        throw new vm_js_1.VmError("Negation requires a number", index_js_1.ErrorCode.E405);
                    }
                    break;
                }
                // ── Comparison ───────────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.Eq: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a === b;
                    }
                    else if (typeof a === "boolean" && typeof b === "boolean") {
                        registers[ins.dst] = a === b;
                    }
                    else {
                        registers[ins.dst] = this.hkdEquals(a, b);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Ne: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a !== b;
                    }
                    else if (typeof a === "boolean" && typeof b === "boolean") {
                        registers[ins.dst] = a !== b;
                    }
                    else {
                        registers[ins.dst] = !this.hkdEquals(a, b);
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Lt: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a < b;
                    }
                    else {
                        registers[ins.dst] = this.compareValues(a, b) < 0;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Le: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a <= b;
                    }
                    else {
                        registers[ins.dst] = this.compareValues(a, b) <= 0;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Gt: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a > b;
                    }
                    else {
                        registers[ins.dst] = this.compareValues(a, b) > 0;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Ge: {
                    const a = registers[ins.src1];
                    const b = registers[ins.src2];
                    if (typeof a === "number" && typeof b === "number") {
                        registers[ins.dst] = a >= b;
                    }
                    else {
                        registers[ins.dst] = this.compareValues(a, b) >= 0;
                    }
                    break;
                }
                // ── Logical & Bitwise ────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.Not:
                    registers[ins.dst] = !this.isTruthy(registers[ins.src1]);
                    break;
                case register_chunk_js_1.RegOp.BitAnd: {
                    const a = this.toInt(registers[ins.src1]);
                    const b = this.toInt(registers[ins.src2]);
                    registers[ins.dst] = a & b;
                    break;
                }
                case register_chunk_js_1.RegOp.BitOr: {
                    const a = this.toInt(registers[ins.src1]);
                    const b = this.toInt(registers[ins.src2]);
                    registers[ins.dst] = a | b;
                    break;
                }
                case register_chunk_js_1.RegOp.BitXor: {
                    const a = this.toInt(registers[ins.src1]);
                    const b = this.toInt(registers[ins.src2]);
                    registers[ins.dst] = a ^ b;
                    break;
                }
                case register_chunk_js_1.RegOp.BitNot:
                    registers[ins.dst] = ~this.toInt(registers[ins.src1]);
                    break;
                case register_chunk_js_1.RegOp.Shl: {
                    const a = this.toInt(registers[ins.src1]);
                    const b = this.toInt(registers[ins.src2]);
                    registers[ins.dst] = a << b;
                    break;
                }
                case register_chunk_js_1.RegOp.Shr: {
                    const a = this.toInt(registers[ins.src1]);
                    const b = this.toInt(registers[ins.src2]);
                    registers[ins.dst] = a >> b;
                    break;
                }
                // ── Jumps ────────────────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.Jump:
                    frame.ip = ins.dst;
                    break;
                case register_chunk_js_1.RegOp.JumpIf: {
                    const cond = registers[ins.dst];
                    if (cond === true || (cond && cond !== 0 && cond !== "")) {
                        frame.ip = ins.src2;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.JumpIfNot: {
                    const cond = registers[ins.dst];
                    if (cond !== true && (!cond || cond === 0 || cond === "")) {
                        frame.ip = ins.src2;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.JumpNull: {
                    if (registers[ins.dst] === null) {
                        frame.ip = ins.src2;
                    }
                    break;
                }
                // ── Functions & Calls ────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.Call: {
                    const callee = registers[ins.src1];
                    const argc = ins.extra?.argc ?? 0;
                    const argStart = ins.src2;
                    if (callee === null || callee === undefined) {
                        throw new vm_js_1.VmError("Cannot call null", index_js_1.ErrorCode.E408);
                    }
                    const c = callee;
                    if (c.type === "native") {
                        const native = c;
                        if (native.arity >= 0 && native.arity !== argc) {
                            throw new vm_js_1.VmError(`${native.name}() expects ${native.arity} argument(s), got ${argc}`, index_js_1.ErrorCode.E307);
                        }
                        if (argc === 1 && native.call1) {
                            registers[ins.dst] = native.call1(registers[argStart]);
                        }
                        else if (argc === 2 && native.call2) {
                            registers[ins.dst] = native.call2(registers[argStart], registers[argStart + 1]);
                        }
                        else if (argc === 0) {
                            registers[ins.dst] = native.call(EMPTY_ARGS);
                        }
                        else {
                            registers[ins.dst] = native.call(registers.slice(argStart, argStart + argc));
                        }
                        break;
                    }
                    let fn;
                    let closure;
                    if (c.type === "function") {
                        fn = c;
                        closure = fn._defaultClosure;
                        if (!closure) {
                            closure = { type: "closure", fn, upvalues: [] };
                            fn._defaultClosure = closure;
                        }
                    }
                    else if (c.type === "closure") {
                        closure = c;
                        fn = closure.fn;
                    }
                    else {
                        throw new vm_js_1.VmError(`\`${(0, chunk_js_1.formatValue)(callee)}\` is not callable`, index_js_1.ErrorCode.E408);
                    }
                    if (fn.arity !== argc) {
                        throw new vm_js_1.VmError(`${fn.name}() expects ${fn.arity} argument(s), got ${argc}`, index_js_1.ErrorCode.E307);
                    }
                    let targetChunk = fn.registerChunk;
                    if (!targetChunk) {
                        targetChunk = (0, register_lowering_js_1.lowerToRegisterChunk)(fn.chunk);
                        fn.registerChunk = targetChunk;
                    }
                    // Tail call optimization for self-recursion
                    if (frame.ip < code.length && code[frame.ip].op === register_chunk_js_1.RegOp.Return && targetChunk === frame.chunk) {
                        for (let i = 0; i < argc; i++) {
                            registers[i] = registers[argStart + i];
                        }
                        frame.ip = 0;
                        break;
                    }
                    const regSize = Math.max(targetChunk.registerCount + 32, 128);
                    let newRegs;
                    if (this.regArrayPool.length > 0 && this.regArrayPool[this.regArrayPool.length - 1].length >= regSize) {
                        newRegs = this.regArrayPool.pop();
                    }
                    else {
                        newRegs = new Array(regSize);
                    }
                    for (let i = 0; i < argc; i++) {
                        newRegs[i] = registers[argStart + i];
                    }
                    this.pushFrame(closure, targetChunk, newRegs, ins.dst);
                    frame = this.frames[this.frames.length - 1];
                    code = frame.chunk.code;
                    registers = frame.registers;
                    constants = frame.chunk.constants;
                    cells = frame.cells;
                    break;
                }
                case register_chunk_js_1.RegOp.Return: {
                    const returnValue = registers[ins.dst];
                    const returnFrame = this.frames.pop();
                    if (this.regArrayPool.length < 256) {
                        this.regArrayPool.push(returnFrame.registers);
                    }
                    if (this.framePool.length < 256) {
                        returnFrame.closure = null;
                        returnFrame.registers = null;
                        returnFrame.cells.length = 0;
                        this.framePool.push(returnFrame);
                    }
                    if (this.frames.length === targetFrames) {
                        return { ok: true, value: returnValue };
                    }
                    frame = this.frames[this.frames.length - 1];
                    code = frame.chunk.code;
                    registers = frame.registers;
                    constants = frame.chunk.constants;
                    cells = frame.cells;
                    registers[returnFrame.destReg] = returnValue;
                    break;
                }
                case register_chunk_js_1.RegOp.MakeClosure: {
                    const fn = constants[ins.src1];
                    const upvaluesData = ins.extra?.upvaluesData ?? [];
                    const upvalues = [];
                    for (const u of upvaluesData) {
                        if (u.isLocal) {
                            upvalues.push({
                                value: registers[u.index],
                                closed: false,
                                stackIndex: u.index,
                            });
                        }
                        else {
                            upvalues.push(frame.closure?.upvalues[u.index] ?? {
                                value: null,
                                closed: true,
                                stackIndex: -1,
                            });
                        }
                    }
                    registers[ins.dst] = { type: "closure", fn, upvalues };
                    break;
                }
                // ── Arrays & Objects ─────────────────────────────────────────────────
                case register_chunk_js_1.RegOp.MakeArray: {
                    const elements = registers.slice(ins.src1, ins.src1 + ins.src2);
                    registers[ins.dst] = { type: "array", elements };
                    break;
                }
                case register_chunk_js_1.RegOp.GetIndex: {
                    const obj = registers[ins.src1];
                    const idx = registers[ins.src2];
                    if (typeof idx === "number" && obj !== null && typeof obj === "object" && obj.type === "array") {
                        const arr = obj.elements;
                        const i = idx < 0 ? arr.length + idx : idx;
                        if (i >= 0 && i < arr.length) {
                            registers[ins.dst] = arr[i];
                            break;
                        }
                    }
                    registers[ins.dst] = this.getIndex(obj, idx);
                    break;
                }
                case register_chunk_js_1.RegOp.SetIndex: {
                    const obj = registers[ins.dst];
                    const idx = registers[ins.src1];
                    if (typeof idx === "number" && obj !== null && typeof obj === "object" && obj.type === "array") {
                        obj.elements[idx] = registers[ins.src2];
                        break;
                    }
                    this.setIndex(obj, idx, registers[ins.src2]);
                    break;
                }
                case register_chunk_js_1.RegOp.ArrayLen: {
                    const obj = registers[ins.src1];
                    if (obj !== null && typeof obj === "object" && obj.type === "array") {
                        registers[ins.dst] = obj.elements.length;
                        break;
                    }
                    registers[ins.dst] = this.getArrayLen(obj);
                    break;
                }
                case register_chunk_js_1.RegOp.MakeObject: {
                    const pairCount = ins.src2;
                    const startReg = ins.src1;
                    const fields = new Map();
                    for (let i = 0; i < pairCount; i++) {
                        const k = registers[startReg + i * 2];
                        const v = registers[startReg + i * 2 + 1];
                        fields.set(k, v);
                    }
                    registers[ins.dst] = { type: "object", fields };
                    break;
                }
                case register_chunk_js_1.RegOp.GetField: {
                    const obj = registers[ins.src1];
                    const fieldName = constants[ins.src2];
                    if (obj !== null && typeof obj === "object" && obj.type === "object") {
                        const val = obj.fields.get(fieldName);
                        if (val !== undefined) {
                            registers[ins.dst] = val;
                            break;
                        }
                    }
                    registers[ins.dst] = this.getField(obj, fieldName);
                    break;
                }
                case register_chunk_js_1.RegOp.SetField: {
                    const obj = registers[ins.dst];
                    const fieldName = constants[ins.src1];
                    if (obj !== null && typeof obj === "object" && obj.type === "object") {
                        obj.fields.set(fieldName, registers[ins.src2]);
                        break;
                    }
                    this.setField(obj, fieldName, registers[ins.src2]);
                    break;
                }
                // ── Iterators & String ───────────────────────────────────────────────
                case register_chunk_js_1.RegOp.MakeIter:
                    registers[ins.dst] = this.makeIterator(registers[ins.src1]);
                    break;
                case register_chunk_js_1.RegOp.IterNext: {
                    const iter = registers[ins.src1];
                    if (!iter || iter.type !== "iterator") {
                        throw new vm_js_1.VmError("IterNext requires an iterator", index_js_1.ErrorCode.E405);
                    }
                    const result = iter.next();
                    if (result.done) {
                        frame.ip = ins.src2;
                    }
                    else {
                        registers[ins.dst] = result.value;
                    }
                    break;
                }
                case register_chunk_js_1.RegOp.Concat: {
                    const parts = registers.slice(ins.src1, ins.src1 + ins.src2);
                    registers[ins.dst] = parts.map((p) => this.hkdToString(p)).join("");
                    break;
                }
                case register_chunk_js_1.RegOp.Halt:
                    return { ok: true, value: ins.dst >= 0 ? (registers[ins.dst] ?? null) : null };
                default:
                    throw new vm_js_1.VmError(`Unknown register opcode: ${ins.op}`, index_js_1.ErrorCode.E503);
            }
        }
    }
    // ── Value Helpers ──────────────────────────────────────────────────────────
    toInt(v) {
        if (typeof v !== "number")
            throw new vm_js_1.VmError("Expected integer", index_js_1.ErrorCode.E405);
        return v | 0;
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
        if (a.type === "array" && b.type === "array") {
            const aa = a.elements;
            const ba = b.elements;
            if (aa.length !== ba.length)
                return false;
            return aa.every((v, i) => this.hkdEquals(v, ba[i]));
        }
        return a === b;
    }
    compareValues(a, b) {
        if (typeof a === "number" && typeof b === "number")
            return a - b;
        if (typeof a === "string" && typeof b === "string")
            return a < b ? -1 : a > b ? 1 : 0;
        throw new vm_js_1.VmError(`Cannot compare ${typeof a} and ${typeof b}`, index_js_1.ErrorCode.E405);
    }
    hkdToString(v) {
        if (v === null)
            return "null";
        if (typeof v === "boolean")
            return String(v);
        if (typeof v === "number") {
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
                throw new vm_js_1.VmError("Array index must be an Int", index_js_1.ErrorCode.E405);
            const i = index < 0 ? arr.elements.length + index : index;
            if (i < 0 || i >= arr.elements.length) {
                throw new vm_js_1.VmError(`Index ${index} out of bounds for array of length ${arr.elements.length}`, index_js_1.ErrorCode.E402);
            }
            return arr.elements[i];
        }
        if (typeof obj === "string") {
            if (typeof index !== "number")
                throw new vm_js_1.VmError("String index must be an Int", index_js_1.ErrorCode.E405);
            return obj[index] ?? null;
        }
        if (obj?.type === "object") {
            if (typeof index !== "string")
                throw new vm_js_1.VmError("Object key must be a String", index_js_1.ErrorCode.E405);
            return obj.fields.get(index) ?? null;
        }
        throw new vm_js_1.VmError(`Cannot index ${typeof obj}`, index_js_1.ErrorCode.E405);
    }
    setIndex(obj, index, value) {
        if (obj?.type === "array") {
            const arr = obj;
            if (typeof index !== "number")
                throw new vm_js_1.VmError("Array index must be an Int", index_js_1.ErrorCode.E405);
            arr.elements[index] = value;
            return;
        }
        if (obj?.type === "object") {
            if (typeof index !== "string")
                throw new vm_js_1.VmError("Object key must be a String", index_js_1.ErrorCode.E405);
            obj.fields.set(index, value);
            return;
        }
        throw new vm_js_1.VmError(`Cannot index-assign ${typeof obj}`, index_js_1.ErrorCode.E405);
    }
    getArrayLen(arr) {
        if (arr?.type === "array")
            return arr.elements.length;
        if (typeof arr === "string")
            return arr.length;
        throw new vm_js_1.VmError("len() requires an array or string", index_js_1.ErrorCode.E405);
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
    setField(obj, field, value) {
        if (obj?.type === "object") {
            obj.fields.set(field, value);
            return;
        }
        throw new vm_js_1.VmError(`Cannot set field on ${typeof obj}`, index_js_1.ErrorCode.E405);
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
        throw new vm_js_1.VmError(`Value is not iterable`, index_js_1.ErrorCode.E405);
    }
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
        this.defineNative("input", 1, (_args) => "");
        this.defineNative("len", 1, (args) => {
            const v = args[0];
            if (v?.type === "array")
                return v.elements.length;
            if (typeof v === "string")
                return v.length;
            if (v?.type === "object")
                return v.fields.size;
            throw new vm_js_1.VmError(`len() not supported for ${typeof v}`, index_js_1.ErrorCode.E405);
        }, (v) => {
            if (v?.type === "array")
                return v.elements.length;
            if (typeof v === "string")
                return v.length;
            if (v?.type === "object")
                return v.fields.size;
            throw new vm_js_1.VmError(`len() not supported for ${typeof v}`, index_js_1.ErrorCode.E405);
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
        }, (v) => {
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
        this.defineNative("to_string", 1, (args) => this.hkdToString(args[0]), (a) => this.hkdToString(a));
        this.defineNative("to_int", 1, (args) => {
            const v = args[0];
            if (typeof v === "number")
                return Math.trunc(v);
            if (typeof v === "string") {
                const n = parseInt(v, 10);
                if (isNaN(n))
                    throw new vm_js_1.VmError(`Cannot convert "${v}" to Int`, index_js_1.ErrorCode.E405);
                return n;
            }
            if (typeof v === "boolean")
                return v ? 1 : 0;
            throw new vm_js_1.VmError(`Cannot convert to Int`, index_js_1.ErrorCode.E405);
        });
        this.defineNative("to_float", 1, (args) => {
            const v = args[0];
            if (typeof v === "number")
                return v;
            if (typeof v === "string") {
                const n = parseFloat(v);
                if (isNaN(n))
                    throw new vm_js_1.VmError(`Cannot convert "${v}" to Float`, index_js_1.ErrorCode.E405);
                return n;
            }
            throw new vm_js_1.VmError(`Cannot convert to Float`, index_js_1.ErrorCode.E405);
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
            throw new vm_js_1.VmError(this.hkdToString(args[0]), index_js_1.ErrorCode.E405);
        });
        this.defineNative("__assert__", 2, (args) => {
            if (!this.isTruthy(args[0])) {
                throw new vm_js_1.VmError(`Assertion failed: ${this.hkdToString(args[1])}`, index_js_1.ErrorCode.E405);
            }
            return null;
        });
        this.defineNative("assert", -1, (args) => {
            if (!this.isTruthy(args[0])) {
                const msg = args[1] ? this.hkdToString(args[1]) : "Assertion failed";
                throw new vm_js_1.VmError(msg, index_js_1.ErrorCode.E405);
            }
            return null;
        });
        this.defineNative("__register_test__", 2, (_args) => null);
        this.defineNative("__import__", 1, (_args) => null);
        // Async / Future primitives
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
                if (obj.fields.get("state") !== "pending")
                    return fut;
                obj.fields.set("state", "resolved");
                obj.fields.set("value", val);
                const cbs = this.futureCallbacks.get(obj);
                if (cbs) {
                    this.futureCallbacks.delete(obj);
                    for (const cb of cbs)
                        this.dispatchCallback(cb, [val]);
                }
            }
            return fut;
        });
        this.defineNative("__hkd_reject", 2, (args) => {
            const fut = args[0];
            const err = args[1] !== undefined ? args[1] : null;
            if (fut && typeof fut === "object" && fut.type === "object") {
                const obj = fut;
                if (obj.fields.get("state") !== "pending")
                    return fut;
                obj.fields.set("state", "rejected");
                obj.fields.set("error", err);
                const cbs = this.futureCallbacks.get(obj);
                if (cbs) {
                    this.futureCallbacks.delete(obj);
                    for (const cb of cbs)
                        this.dispatchCallback(cb, [null]);
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
exports.RegisterVM = RegisterVM;
//# sourceMappingURL=vm_register.js.map