"use strict";
/**
 * HKD Stack-to-Register Bytecode Lowering Engine
 *
 * Deterministically lowers Stack-based bytecode chunks to 3-address
 * virtual register chunks for execution on the Register VM.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.lowerToRegisterChunk = lowerToRegisterChunk;
const register_chunk_js_1 = require("./register_chunk.js");
const optimizer_js_1 = require("./optimizer.js");
function lowerToRegisterChunk(chunk, optPipeline) {
    const regChunk = new register_chunk_js_1.RegisterChunk(chunk.name, chunk.arity);
    regChunk.constants = [...chunk.constants];
    const opt = optPipeline ?? new optimizer_js_1.OptimizerPipeline();
    // Recursively lower nested functions in constants
    for (let i = 0; i < regChunk.constants.length; i++) {
        const c = regChunk.constants[i];
        if (c && typeof c === "object" && c.type === "function") {
            const fn = c;
            if (!fn.registerChunk) {
                fn.registerChunk = lowerToRegisterChunk(fn.chunk, opt);
            }
        }
    }
    const numLocals = Math.max(chunk.localCount, chunk.arity, 64);
    const code = chunk.code;
    const lines = chunk.lines;
    const codeLen = code.length;
    // Pass 1: Build basic instruction list and track stack_ip -> reg_idx mapping
    // Pre-allocated Int32Array eliminates thousands of Map bucket allocations and hashing
    const ipToReg = new Int32Array(codeLen + 1);
    ipToReg.fill(-1);
    const jumpFixups = [];
    let sp = 0; // Simulated operand stack pointer (relative to numLocals)
    let ip = 0;
    function reg(slot) {
        return numLocals + slot;
    }
    while (ip < codeLen) {
        ipToReg[ip] = regChunk.code.length;
        const line = lines[ip] || 0;
        const op = code[ip++];
        switch (op) {
            case 1 /* Op.LoadConst */: {
                const idx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadConst, dst, idx, 0, line);
                break;
            }
            case 2 /* Op.LoadNull */: {
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadNull, dst, 0, 0, line);
                break;
            }
            case 3 /* Op.LoadTrue */: {
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadTrue, dst, 0, 0, line);
                break;
            }
            case 4 /* Op.LoadFalse */: {
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadFalse, dst, 0, 0, line);
                break;
            }
            case 5 /* Op.Pop */: {
                if (sp > 0)
                    sp--;
                break;
            }
            case 6 /* Op.Dup */: {
                const src = reg(sp - 1);
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.Move, dst, src, 0, line);
                break;
            }
            case 16 /* Op.LoadLocal */: {
                const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.Move, dst, slot, 0, line);
                break;
            }
            case 17 /* Op.StoreLocal */: {
                const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Move, slot, src, 0, line);
                break;
            }
            case 18 /* Op.DefineLocal */: {
                const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const src = reg(--sp);
                regChunk.emit(register_chunk_js_1.RegOp.Move, slot, src, 0, line);
                break;
            }
            case 19 /* Op.LoadGlobal */: {
                const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadGlobal, dst, nameIdx, 0, line);
                break;
            }
            case 20 /* Op.StoreGlobal */: {
                const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.StoreGlobal, nameIdx, src, 0, line);
                break;
            }
            case 21 /* Op.DefineGlobal */: {
                const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const src = reg(--sp);
                regChunk.emit(register_chunk_js_1.RegOp.DefineGlobal, nameIdx, src, 0, line);
                break;
            }
            case 22 /* Op.LoadUpvalue */: {
                const uvIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.LoadUpvalue, dst, uvIdx, 0, line);
                break;
            }
            case 23 /* Op.StoreUpvalue */: {
                const uvIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.StoreUpvalue, uvIdx, src, 0, line);
                break;
            }
            case 24 /* Op.CloseUpvalue */: {
                if (sp > 0)
                    sp--;
                break;
            }
            case 32 /* Op.Add */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Add, src1, src1, src2, line);
                break;
            }
            case 33 /* Op.Sub */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Sub, src1, src1, src2, line);
                break;
            }
            case 34 /* Op.Mul */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Mul, src1, src1, src2, line);
                break;
            }
            case 35 /* Op.Div */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Div, src1, src1, src2, line);
                break;
            }
            case 36 /* Op.Mod */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Mod, src1, src1, src2, line);
                break;
            }
            case 37 /* Op.Pow */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Pow, src1, src1, src2, line);
                break;
            }
            case 38 /* Op.Neg */: {
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Neg, src, src, 0, line);
                break;
            }
            case 48 /* Op.Eq */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Eq, src1, src1, src2, line);
                break;
            }
            case 49 /* Op.Ne */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Ne, src1, src1, src2, line);
                break;
            }
            case 50 /* Op.Lt */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Lt, src1, src1, src2, line);
                break;
            }
            case 51 /* Op.Le */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Le, src1, src1, src2, line);
                break;
            }
            case 52 /* Op.Gt */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Gt, src1, src1, src2, line);
                break;
            }
            case 53 /* Op.Ge */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Ge, src1, src1, src2, line);
                break;
            }
            case 64 /* Op.Not */: {
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Not, src, src, 0, line);
                break;
            }
            case 65 /* Op.BitAnd */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.BitAnd, src1, src1, src2, line);
                break;
            }
            case 66 /* Op.BitOr */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.BitOr, src1, src1, src2, line);
                break;
            }
            case 67 /* Op.BitXor */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.BitXor, src1, src1, src2, line);
                break;
            }
            case 68 /* Op.BitNot */: {
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.BitNot, src, src, 0, line);
                break;
            }
            case 69 /* Op.Shl */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Shl, src1, src1, src2, line);
                break;
            }
            case 70 /* Op.Shr */: {
                const src2 = reg(--sp);
                const src1 = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.Shr, src1, src1, src2, line);
                break;
            }
            case 80 /* Op.Jump */: {
                const raw = (code[ip] << 8) | code[ip + 1];
                const offset = raw > 0x7fff ? raw - 0x10000 : raw;
                ip += 2;
                const targetStackIp = ip + offset;
                const rIdx = regChunk.emit(register_chunk_js_1.RegOp.Jump, 0, 0, 0, line);
                jumpFixups.push({ regIdx: rIdx, targetStackIp });
                break;
            }
            case 81 /* Op.JumpFalse */: {
                const raw = (code[ip] << 8) | code[ip + 1];
                const offset = raw > 0x7fff ? raw - 0x10000 : raw;
                ip += 2;
                const targetStackIp = ip + offset;
                const cond = reg(sp - 1);
                const rIdx = regChunk.emit(register_chunk_js_1.RegOp.JumpIfNot, cond, 0, 0, line);
                jumpFixups.push({ regIdx: rIdx, targetStackIp });
                break;
            }
            case 82 /* Op.JumpTrue */: {
                const raw = (code[ip] << 8) | code[ip + 1];
                const offset = raw > 0x7fff ? raw - 0x10000 : raw;
                ip += 2;
                const targetStackIp = ip + offset;
                const cond = reg(sp - 1);
                const rIdx = regChunk.emit(register_chunk_js_1.RegOp.JumpIf, cond, 0, 0, line);
                jumpFixups.push({ regIdx: rIdx, targetStackIp });
                break;
            }
            case 83 /* Op.JumpNull */: {
                const raw = (code[ip] << 8) | code[ip + 1];
                const offset = raw > 0x7fff ? raw - 0x10000 : raw;
                ip += 2;
                const targetStackIp = ip + offset;
                const cond = reg(sp - 1);
                const rIdx = regChunk.emit(register_chunk_js_1.RegOp.JumpNull, cond, 0, 0, line);
                jumpFixups.push({ regIdx: rIdx, targetStackIp });
                break;
            }
            case 96 /* Op.Call */: {
                const argc = code[ip++];
                const callee = reg(sp - 1 - argc);
                const argStart = callee + 1;
                const dst = callee;
                regChunk.emit(register_chunk_js_1.RegOp.Call, dst, callee, argStart, line, { argc });
                sp = sp - argc;
                break;
            }
            case 97 /* Op.Return */: {
                const src = reg(--sp);
                regChunk.emit(register_chunk_js_1.RegOp.Return, src, 0, 0, line);
                break;
            }
            case 98 /* Op.MakeClosure */: {
                const fnIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const upCount = code[ip++];
                const upvaluesData = [];
                for (let i = 0; i < upCount; i++) {
                    const isLocal = code[ip++] === 1;
                    const idx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                    ip += 2;
                    upvaluesData.push({ isLocal, index: idx });
                }
                const dst = reg(sp++);
                regChunk.emit(register_chunk_js_1.RegOp.MakeClosure, dst, fnIdx, upCount, line, { upvaluesData });
                break;
            }
            case 112 /* Op.MakeArray */: {
                const count = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const startReg = reg(sp - count);
                const dst = startReg;
                regChunk.emit(register_chunk_js_1.RegOp.MakeArray, dst, startReg, count, line);
                sp = sp - count + 1;
                break;
            }
            case 113 /* Op.GetIndex */: {
                const indexReg = reg(--sp);
                const objReg = reg(sp - 1);
                const dst = objReg;
                regChunk.emit(register_chunk_js_1.RegOp.GetIndex, dst, objReg, indexReg, line);
                break;
            }
            case 114 /* Op.SetIndex */: {
                const indexReg = reg(--sp);
                const objReg = reg(--sp);
                const valReg = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.SetIndex, objReg, indexReg, valReg, line);
                break;
            }
            case 115 /* Op.ArrayLen */: {
                const arrReg = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.ArrayLen, arrReg, arrReg, 0, line);
                break;
            }
            case 128 /* Op.MakeObject */: {
                const pairCount = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const startReg = reg(sp - pairCount * 2);
                const dst = startReg;
                regChunk.emit(register_chunk_js_1.RegOp.MakeObject, dst, startReg, pairCount, line);
                sp = sp - pairCount * 2 + 1;
                break;
            }
            case 129 /* Op.GetField */: {
                const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const objReg = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.GetField, objReg, objReg, nameIdx, line);
                break;
            }
            case 130 /* Op.SetField */: {
                const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const objReg = reg(--sp);
                const valReg = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.SetField, objReg, nameIdx, valReg, line);
                break;
            }
            case 144 /* Op.MakeIter */: {
                const src = reg(sp - 1);
                regChunk.emit(register_chunk_js_1.RegOp.MakeIter, src, src, 0, line);
                break;
            }
            case 145 /* Op.IterNext */: {
                const raw = (code[ip] << 8) | code[ip + 1];
                const offset = raw > 0x7fff ? raw - 0x10000 : raw;
                ip += 2;
                const targetStackIp = ip + offset;
                const iterReg = reg(sp - 1);
                const dst = reg(sp++);
                const rIdx = regChunk.emit(register_chunk_js_1.RegOp.IterNext, dst, iterReg, 0, line);
                jumpFixups.push({ regIdx: rIdx, targetStackIp });
                break;
            }
            case 160 /* Op.Concat */: {
                const count = ((code[ip] << 8) | code[ip + 1]) >>> 0;
                ip += 2;
                const startReg = reg(sp - count);
                const dst = startReg;
                regChunk.emit(register_chunk_js_1.RegOp.Concat, dst, startReg, count, line);
                sp = sp - count + 1;
                break;
            }
            case 240 /* Op.LineInfo */: {
                ip += 2;
                break;
            }
            case 255 /* Op.Halt */: {
                const resultReg = sp > 0 ? reg(sp - 1) : -1;
                regChunk.emit(register_chunk_js_1.RegOp.Halt, resultReg, 0, 0, line);
                break;
            }
            default:
                break;
        }
    }
    // Pass 2: Patch jump targets to register instruction indices
    ipToReg[codeLen] = regChunk.code.length;
    for (let i = 0; i < jumpFixups.length; i++) {
        const fix = jumpFixups[i];
        const targetRegIdx = ipToReg[fix.targetStackIp];
        if (targetRegIdx !== -1) {
            const ins = regChunk.code[fix.regIdx];
            if (ins.op === register_chunk_js_1.RegOp.Jump) {
                ins.dst = targetRegIdx;
            }
            else {
                ins.src2 = targetRegIdx;
            }
        }
    }
    // Pass 3: Register-level optimization & compaction
    return opt.optimizeRegister(regChunk);
}
//# sourceMappingURL=register_lowering.js.map