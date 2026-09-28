/**
 * HKD Stack-to-Register Bytecode Lowering Engine
 *
 * Deterministically lowers Stack-based bytecode chunks to 3-address
 * virtual register chunks for execution on the Register VM.
 */

import { Chunk, HkdFunction, HkdValue } from "./chunk.js";
import { Op } from "./opcodes.js";
import { RegisterChunk, RegOp } from "./register_chunk.js";

export function lowerToRegisterChunk(chunk: Chunk): RegisterChunk {
  const regChunk = new RegisterChunk(chunk.name, chunk.arity);
  regChunk.constants = [...chunk.constants];

  // Recursively lower nested functions in constants
  for (let i = 0; i < regChunk.constants.length; i++) {
    const c = regChunk.constants[i];
    if (c && typeof c === "object" && (c as any).type === "function") {
      const fn = c as HkdFunction;
      if (!(fn as any).registerChunk) {
        (fn as any).registerChunk = lowerToRegisterChunk(fn.chunk);
      }
    }
  }

  const numLocals = Math.max(chunk.localCount, chunk.arity, 64);
  const code = chunk.code;
  const lines = chunk.lines;

  // Pass 1: Build basic instruction list and track stack_ip -> reg_idx mapping
  const ipToRegIdx = new Map<number, number>();
  const jumpFixups: Array<{ regIdx: number; targetStackIp: number }> = [];

  let sp = 0; // Simulated operand stack pointer (relative to numLocals)
  let ip = 0;

  function reg(slot: number): number {
    return numLocals + slot;
  }

  while (ip < code.length) {
    ipToRegIdx.set(ip, regChunk.code.length);
    const line = lines[ip] || 0;
    const op = code[ip++];

    switch (op) {
      case Op.LoadConst: {
        const idx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadConst, dst, idx, 0, line);
        break;
      }

      case Op.LoadNull: {
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadNull, dst, 0, 0, line);
        break;
      }

      case Op.LoadTrue: {
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadTrue, dst, 0, 0, line);
        break;
      }

      case Op.LoadFalse: {
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadFalse, dst, 0, 0, line);
        break;
      }

      case Op.Pop: {
        if (sp > 0) sp--;
        break;
      }

      case Op.Dup: {
        const src = reg(sp - 1);
        const dst = reg(sp++);
        regChunk.emit(RegOp.Move, dst, src, 0, line);
        break;
      }

      case Op.LoadLocal: {
        const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const dst = reg(sp++);
        regChunk.emit(RegOp.Move, dst, slot, 0, line);
        break;
      }

      case Op.StoreLocal: {
        const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const src = reg(sp - 1);
        regChunk.emit(RegOp.Move, slot, src, 0, line);
        break;
      }

      case Op.DefineLocal: {
        const slot = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const src = reg(--sp);
        regChunk.emit(RegOp.Move, slot, src, 0, line);
        break;
      }

      case Op.LoadGlobal: {
        const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadGlobal, dst, nameIdx, 0, line);
        break;
      }

      case Op.StoreGlobal: {
        const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const src = reg(sp - 1);
        regChunk.emit(RegOp.StoreGlobal, nameIdx, src, 0, line);
        break;
      }

      case Op.DefineGlobal: {
        const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const src = reg(--sp);
        regChunk.emit(RegOp.DefineGlobal, nameIdx, src, 0, line);
        break;
      }

      case Op.LoadUpvalue: {
        const uvIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const dst = reg(sp++);
        regChunk.emit(RegOp.LoadUpvalue, dst, uvIdx, 0, line);
        break;
      }

      case Op.StoreUpvalue: {
        const uvIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const src = reg(sp - 1);
        regChunk.emit(RegOp.StoreUpvalue, uvIdx, src, 0, line);
        break;
      }

      case Op.CloseUpvalue: {
        if (sp > 0) sp--;
        break;
      }

      case Op.Add: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Add, src1, src1, src2, line);
        break;
      }

      case Op.Sub: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Sub, src1, src1, src2, line);
        break;
      }

      case Op.Mul: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Mul, src1, src1, src2, line);
        break;
      }

      case Op.Div: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Div, src1, src1, src2, line);
        break;
      }

      case Op.Mod: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Mod, src1, src1, src2, line);
        break;
      }

      case Op.Pow: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Pow, src1, src1, src2, line);
        break;
      }

      case Op.Neg: {
        const src = reg(sp - 1);
        regChunk.emit(RegOp.Neg, src, src, 0, line);
        break;
      }

      case Op.Eq: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Eq, src1, src1, src2, line);
        break;
      }

      case Op.Ne: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Ne, src1, src1, src2, line);
        break;
      }

      case Op.Lt: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Lt, src1, src1, src2, line);
        break;
      }

      case Op.Le: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Le, src1, src1, src2, line);
        break;
      }

      case Op.Gt: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Gt, src1, src1, src2, line);
        break;
      }

      case Op.Ge: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Ge, src1, src1, src2, line);
        break;
      }

      case Op.Not: {
        const src = reg(sp - 1);
        regChunk.emit(RegOp.Not, src, src, 0, line);
        break;
      }

      case Op.BitAnd: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.BitAnd, src1, src1, src2, line);
        break;
      }

      case Op.BitOr: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.BitOr, src1, src1, src2, line);
        break;
      }

      case Op.BitXor: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.BitXor, src1, src1, src2, line);
        break;
      }

      case Op.BitNot: {
        const src = reg(sp - 1);
        regChunk.emit(RegOp.BitNot, src, src, 0, line);
        break;
      }

      case Op.Shl: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Shl, src1, src1, src2, line);
        break;
      }

      case Op.Shr: {
        const src2 = reg(--sp);
        const src1 = reg(sp - 1);
        regChunk.emit(RegOp.Shr, src1, src1, src2, line);
        break;
      }

      case Op.Jump: {
        const raw = (code[ip] << 8) | code[ip + 1];
        const offset = raw > 0x7fff ? raw - 0x10000 : raw;
        ip += 2;
        const targetStackIp = ip + offset;
        const rIdx = regChunk.emit(RegOp.Jump, 0, 0, 0, line);
        jumpFixups.push({ regIdx: rIdx, targetStackIp });
        break;
      }

      case Op.JumpFalse: {
        const raw = (code[ip] << 8) | code[ip + 1];
        const offset = raw > 0x7fff ? raw - 0x10000 : raw;
        ip += 2;
        const targetStackIp = ip + offset;
        const cond = reg(sp - 1);
        const rIdx = regChunk.emit(RegOp.JumpIfNot, cond, 0, 0, line);
        jumpFixups.push({ regIdx: rIdx, targetStackIp });
        break;
      }

      case Op.JumpTrue: {
        const raw = (code[ip] << 8) | code[ip + 1];
        const offset = raw > 0x7fff ? raw - 0x10000 : raw;
        ip += 2;
        const targetStackIp = ip + offset;
        const cond = reg(sp - 1);
        const rIdx = regChunk.emit(RegOp.JumpIf, cond, 0, 0, line);
        jumpFixups.push({ regIdx: rIdx, targetStackIp });
        break;
      }

      case Op.JumpNull: {
        const raw = (code[ip] << 8) | code[ip + 1];
        const offset = raw > 0x7fff ? raw - 0x10000 : raw;
        ip += 2;
        const targetStackIp = ip + offset;
        const cond = reg(sp - 1);
        const rIdx = regChunk.emit(RegOp.JumpNull, cond, 0, 0, line);
        jumpFixups.push({ regIdx: rIdx, targetStackIp });
        break;
      }

      case Op.Call: {
        const argc = code[ip++];
        const callee = reg(sp - 1 - argc);
        const argStart = callee + 1;
        const dst = callee;
        regChunk.emit(RegOp.Call, dst, callee, argStart, line, { argc });
        sp = sp - argc;
        break;
      }

      case Op.Return: {
        const src = reg(--sp);
        regChunk.emit(RegOp.Return, src, 0, 0, line);
        break;
      }

      case Op.MakeClosure: {
        const fnIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const upCount = code[ip++];
        const upvaluesData: Array<{ isLocal: boolean; index: number }> = [];
        for (let i = 0; i < upCount; i++) {
          const isLocal = code[ip++] === 1;
          const idx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
          ip += 2;
          upvaluesData.push({ isLocal, index: idx });
        }
        const dst = reg(sp++);
        regChunk.emit(RegOp.MakeClosure, dst, fnIdx, upCount, line, { upvaluesData });
        break;
      }

      case Op.MakeArray: {
        const count = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const startReg = reg(sp - count);
        const dst = startReg;
        regChunk.emit(RegOp.MakeArray, dst, startReg, count, line);
        sp = sp - count + 1;
        break;
      }

      case Op.GetIndex: {
        const indexReg = reg(--sp);
        const objReg = reg(sp - 1);
        const dst = objReg;
        regChunk.emit(RegOp.GetIndex, dst, objReg, indexReg, line);
        break;
      }

      case Op.SetIndex: {
        const indexReg = reg(--sp);
        const objReg = reg(--sp);
        const valReg = reg(sp - 1);
        regChunk.emit(RegOp.SetIndex, objReg, indexReg, valReg, line);
        break;
      }

      case Op.ArrayLen: {
        const arrReg = reg(sp - 1);
        regChunk.emit(RegOp.ArrayLen, arrReg, arrReg, 0, line);
        break;
      }

      case Op.MakeObject: {
        const pairCount = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const startReg = reg(sp - pairCount * 2);
        const dst = startReg;
        regChunk.emit(RegOp.MakeObject, dst, startReg, pairCount, line);
        sp = sp - pairCount * 2 + 1;
        break;
      }

      case Op.GetField: {
        const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const objReg = reg(sp - 1);
        regChunk.emit(RegOp.GetField, objReg, objReg, nameIdx, line);
        break;
      }

      case Op.SetField: {
        const nameIdx = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const objReg = reg(--sp);
        const valReg = reg(sp - 1);
        regChunk.emit(RegOp.SetField, objReg, nameIdx, valReg, line);
        break;
      }

      case Op.MakeIter: {
        const src = reg(sp - 1);
        regChunk.emit(RegOp.MakeIter, src, src, 0, line);
        break;
      }

      case Op.IterNext: {
        const raw = (code[ip] << 8) | code[ip + 1];
        const offset = raw > 0x7fff ? raw - 0x10000 : raw;
        ip += 2;
        const targetStackIp = ip + offset;
        const iterReg = reg(sp - 1);
        const dst = reg(sp++);
        const rIdx = regChunk.emit(RegOp.IterNext, dst, iterReg, 0, line);
        jumpFixups.push({ regIdx: rIdx, targetStackIp });
        break;
      }

      case Op.Concat: {
        const count = ((code[ip] << 8) | code[ip + 1]) >>> 0;
        ip += 2;
        const startReg = reg(sp - count);
        const dst = startReg;
        regChunk.emit(RegOp.Concat, dst, startReg, count, line);
        sp = sp - count + 1;
        break;
      }

      case Op.LineInfo: {
        ip += 2;
        break;
      }

      case Op.Halt: {
        const resultReg = sp > 0 ? reg(sp - 1) : -1;
        regChunk.emit(RegOp.Halt, resultReg, 0, 0, line);
        break;
      }

      default:
        break;
    }
  }

  // Pass 2: Patch jump targets to register instruction indices
  ipToRegIdx.set(code.length, regChunk.code.length);
  for (const fix of jumpFixups) {
    const targetRegIdx = ipToRegIdx.get(fix.targetStackIp);
    if (targetRegIdx !== undefined) {
      const ins = regChunk.code[fix.regIdx];
      if (ins.op === RegOp.Jump) {
        ins.dst = targetRegIdx;
      } else {
        ins.src2 = targetRegIdx;
      }
    }
  }

  return regChunk;
}
