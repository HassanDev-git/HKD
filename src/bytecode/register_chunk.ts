/**
 * HKD Register-Based Bytecode Architecture
 *
 * Defines the instruction format, opcode definitions, and RegisterChunk
 * for Phase 9C Register VM execution.
 */

import { HkdValue } from "./chunk.js";

export enum RegOp {
  Nop          = 0,
  LoadConst    = 1,   // dst, constIdx
  LoadImm      = 2,   // dst, immValue
  LoadNull     = 3,   // dst
  LoadTrue     = 4,   // dst
  LoadFalse    = 5,   // dst
  Move         = 6,   // dst, src
  LoadGlobal   = 7,   // dst, nameConstIdx
  StoreGlobal  = 8,   // nameConstIdx, src
  DefineGlobal = 9,   // nameConstIdx, src
  Add          = 10,  // dst, src1, src2
  Sub          = 11,  // dst, src1, src2
  Mul          = 12,  // dst, src1, src2
  Div          = 13,  // dst, src1, src2
  Mod          = 14,  // dst, src1, src2
  Pow          = 15,  // dst, src1, src2
  Neg          = 16,  // dst, src
  Eq           = 17,  // dst, src1, src2
  Ne           = 18,  // dst, src1, src2
  Lt           = 19,  // dst, src1, src2
  Le           = 20,  // dst, src1, src2
  Gt           = 21,  // dst, src1, src2
  Ge           = 22,  // dst, src1, src2
  Not          = 23,  // dst, src
  BitAnd       = 24,  // dst, src1, src2
  BitOr        = 25,  // dst, src1, src2
  BitXor       = 26,  // dst, src1, src2
  BitNot       = 27,  // dst, src
  Shl          = 28,  // dst, src1, src2
  Shr          = 29,  // dst, src1, src2
  Jump         = 30,  // targetIp
  JumpIf       = 31,  // condReg, targetIp
  JumpIfNot    = 32,  // condReg, targetIp
  JumpNull     = 33,  // condReg, targetIp
  Call         = 34,  // dst, calleeReg, argStartReg, argc
  Return       = 35,  // src
  MakeClosure  = 36,  // dst, fnConstIdx, upvalueCount, upvaluesDataIdx
  LoadUpvalue  = 37,  // dst, uvIdx
  StoreUpvalue = 38,  // uvIdx, src
  CloseUpvalue = 39,  // uvIdx
  MakeArray    = 40,  // dst, startReg, count
  GetIndex     = 41,  // dst, objReg, indexReg
  SetIndex     = 42,  // objReg, indexReg, valReg
  ArrayLen     = 43,  // dst, arrReg
  MakeObject   = 44,  // dst, startReg, pairCount
  GetField     = 45,  // dst, objReg, nameConstIdx
  SetField     = 46,  // objReg, nameConstIdx, valReg
  MakeIter     = 47,  // dst, src
  IterNext     = 48,  // dst, iterReg, targetIp
  Concat       = 49,  // dst, startReg, count
  Halt         = 50,
}

export interface RegInstruction {
  op: RegOp;
  dst: number;
  src1: number;
  src2: number;
  line: number;
  extra?: any;
}

export class RegisterChunk {
  public code: RegInstruction[] = [];
  public constants: HkdValue[] = [];
  public registerCount: number = 0;
  public arity: number = 0;
  public name: string = "<script>";

  constructor(name = "<script>", arity = 0) {
    this.name = name;
    this.arity = arity;
  }

  public emit(op: RegOp, dst: number, src1: number = 0, src2: number = 0, line: number = 0, extra?: any): number {
    const idx = this.code.length;
    this.code.push({ op, dst, src1, src2, line, extra });
    if (dst >= this.registerCount) this.registerCount = dst + 1;
    if (src1 >= this.registerCount) this.registerCount = src1 + 1;
    if (op === RegOp.Call) {
      const maxReg = src1 + (extra?.argc || 0);
      if (maxReg > this.registerCount) this.registerCount = maxReg;
    } else if (op === RegOp.MakeArray || op === RegOp.Concat) {
      const maxReg = src1 + src2;
      if (maxReg > this.registerCount) this.registerCount = maxReg;
    } else if (op === RegOp.MakeObject) {
      const maxReg = src1 + src2 * 2;
      if (maxReg > this.registerCount) this.registerCount = maxReg;
    } else if (
      op !== RegOp.LoadConst && op !== RegOp.LoadGlobal && op !== RegOp.StoreGlobal &&
      op !== RegOp.DefineGlobal && op !== RegOp.GetField && op !== RegOp.SetField &&
      op !== RegOp.Jump && op !== RegOp.JumpIf && op !== RegOp.JumpIfNot && op !== RegOp.JumpNull &&
      op !== RegOp.IterNext
    ) {
      if (src2 >= this.registerCount) this.registerCount = src2 + 1;
    }
    return idx;
  }

  public disassemble(): string {
    const lines: string[] = [];
    lines.push(`== [RegisterChunk] ${this.name} ==`);
    lines.push(`  arity: ${this.arity}  registers: ${this.registerCount}  constants: ${this.constants.length}`);
    for (let i = 0; i < this.code.length; i++) {
      const ins = this.code[i];
      lines.push(`${String(i).padStart(5, "0")}  ${RegOp[ins.op].padEnd(14)} dst=r${ins.dst} src1=r${ins.src1} src2=${ins.src2}`);
    }
    return lines.join("\n");
  }
}
