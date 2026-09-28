/**
 * HKD Bytecode Chunk
 *
 * A Chunk holds:
 *  - A byte array of opcodes + operands
 *  - A constant pool (values referenced by index)
 *  - Line number mapping for debug info
 *  - Metadata (name, arity, local count)
 */

import { Op, OP_NAMES } from "./opcodes.js";

// ─── HKD runtime value types (used in constant pool and at runtime) ───────────

export type HkdValue =
  | null
  | boolean
  | number
  | string
  | HkdArray
  | HkdObject
  | HkdFunction
  | HkdClosure
  | HkdNativeFunction
  | HkdIterator;

export interface HkdArray {
  type: "array";
  elements: HkdValue[];
}

export interface HkdObject {
  type: "object";
  fields: Map<string, HkdValue>;
}

export interface HkdFunction {
  type: "function";
  name: string;
  arity: number;        // expected parameter count
  chunk: Chunk;
  upvalueCount: number;
}

export interface HkdClosure {
  type: "closure";
  fn: HkdFunction;
  upvalues: Upvalue[];
}

export interface HkdNativeFunction {
  type: "native";
  name: string;
  arity: number;        // -1 = variadic
  call: (args: HkdValue[]) => HkdValue;
}

export interface HkdIterator {
  type: "iterator";
  next: () => IteratorResult<HkdValue>;
}

export interface Upvalue {
  value: HkdValue;
  closed: boolean;
  // For open upvalues: index in stack frame locals
  stackIndex: number;
}

// ─── Chunk ────────────────────────────────────────────────────────────────────

export class Chunk {
  public code: number[] = [];
  public constants: HkdValue[] = [];
  public lines: number[] = []; // parallel to code: line number per byte
  public name: string;
  public arity: number;
  public localCount: number = 0;
  public upvalueCount: number = 0;
  private constantMap: Map<string | number | boolean | null, number> = new Map();

  constructor(name = "<script>", arity = 0) {
    this.name = name;
    this.arity = arity;
  }

  // ── Write helpers ──────────────────────────────────────────────────────────

  writeByte(byte: number, line = 0): number {
    const offset = this.code.length;
    this.code.push(byte & 0xff);
    this.lines.push(line);
    return offset;
  }

  writeU16(value: number, line = 0): void {
    this.code.push((value >> 8) & 0xff, value & 0xff);
    this.lines.push(line, line);
  }

  /** Write an opcode and a 16-bit unsigned operand in a single combined push. */
  writeOpU16(op: Op, operand: number, line = 0): number {
    const offset = this.code.length;
    this.code.push(op, (operand >> 8) & 0xff, operand & 0xff);
    this.lines.push(line, line, line);
    return offset;
  }

  /** Write a signed 16-bit offset (for jumps). */
  writeI16(value: number, line = 0): void {
    this.writeU16(value & 0xffff, line);
  }

  /** Add a constant to the pool and return its index. */
  addConstant(value: HkdValue): number {
    // Deduplicate primitives in O(1)
    if (
      value === null ||
      typeof value === "boolean" ||
      typeof value === "number" ||
      typeof value === "string"
    ) {
      const existing = this.constantMap.get(value);
      if (existing !== undefined) return existing;
      const idx = this.constants.length;
      this.constants.push(value);
      this.constantMap.set(value, idx);
      return idx;
    }
    this.constants.push(value);
    return this.constants.length - 1;
  }

  /** Emit LOAD_CONST for a value. */
  emitConstant(value: HkdValue, line = 0): void {
    const idx = this.addConstant(value);
    this.writeOpU16(Op.LoadConst, idx, line);
  }

  /** Emit a jump instruction and return the offset of the placeholder. */
  emitJump(op: Op, line = 0): number {
    const offset = this.code.length + 1;
    this.code.push(op, 0xff, 0xff);
    this.lines.push(line, line, line);
    return offset;
  }

  /** Patch a jump placeholder with the actual offset. */
  patchJump(jumpOffset: number): void {
    // jumpOffset points to the 2-byte placeholder
    // The jump is relative to the byte AFTER the jump instruction
    const target = this.code.length;
    const relative = target - (jumpOffset + 2); // +2 for the 2 operand bytes

    if (relative > 0x7fff || relative < -0x8000) {
      throw new Error("Jump offset too large");
    }

    const u16 = relative & 0xffff;
    this.code[jumpOffset]     = (u16 >> 8) & 0xff;
    this.code[jumpOffset + 1] = u16 & 0xff;
  }

  /** Emit a loop jump back to `loopStart`. */
  emitLoop(loopStart: number, line = 0): void {
    const offset = this.code.length + 1;
    this.code.push(Op.Jump, 0, 0);
    this.lines.push(line, line, line);

    // Relative offset back to loopStart
    const relative = loopStart - this.code.length;
    const u16 = relative & 0xffff;
    this.code[offset]     = (u16 >> 8) & 0xff;
    this.code[offset + 1] = u16 & 0xff;
  }

  // ── Read helpers (used by VM) ───────────────────────────────────────────────

  readByte(ip: number): number {
    return this.code[ip];
  }

  readU16(ip: number): number {
    return ((this.code[ip] << 8) | this.code[ip + 1]) >>> 0;
  }

  readI16(ip: number): number {
    const raw = (this.code[ip] << 8) | this.code[ip + 1];
    // Sign-extend from 16 bits
    return raw > 0x7fff ? raw - 0x10000 : raw;
  }

  // ── Disassembly ────────────────────────────────────────────────────────────

  disassemble(): string {
    const lines: string[] = [];
    lines.push(`== ${this.name} ==`);
    lines.push(`  arity: ${this.arity}  locals: ${this.localCount}  constants: ${this.constants.length}`);
    lines.push("");

    let ip = 0;
    while (ip < this.code.length) {
      const [str, next] = this.disassembleInstruction(ip);
      lines.push(str);
      ip = next;
    }

    return lines.join("\n");
  }

  disassembleInstruction(ip: number): [string, number] {
    const opcode = this.code[ip];
    const name = OP_NAMES[opcode] ?? `UNKNOWN(${opcode.toString(16)})`;
    const line = this.lines[ip] ?? 0;
    const prefix = `${String(ip).padStart(5, "0")}  [${String(line).padStart(4)}]  ${name.padEnd(16)}`;

    switch (opcode) {
      case Op.LoadConst: {
        const idx = this.readU16(ip + 1);
        const val = this.constants[idx];
        return [`${prefix}  #${idx} (${formatValue(val)})`, ip + 3];
      }
      case Op.LoadLocal:
      case Op.StoreLocal:
      case Op.DefineLocal:
      case Op.LoadGlobal:
      case Op.StoreGlobal:
      case Op.DefineGlobal:
      case Op.LoadUpvalue:
      case Op.StoreUpvalue:
      case Op.MakeArray:
      case Op.MakeObject:
      case Op.ArrayLen:
      case Op.GetField:
      case Op.SetField: {
        const idx = this.readU16(ip + 1);
        return [`${prefix}  ${idx}`, ip + 3];
      }
      case Op.Jump:
      case Op.JumpFalse:
      case Op.JumpTrue:
      case Op.JumpNull:
      case Op.IterNext: {
        const offset = this.readI16(ip + 1);
        const target = ip + 3 + offset;
        return [`${prefix}  ${offset >= 0 ? "+" : ""}${offset} -> ${target}`, ip + 3];
      }
      case Op.Call: {
        const argc = this.code[ip + 1];
        return [`${prefix}  argc=${argc}`, ip + 2];
      }
      case Op.MakeClosure: {
        const fnIdx = this.readU16(ip + 1);
        const upCount = this.code[ip + 3];
        return [`${prefix}  fn=#${fnIdx}  upvalues=${upCount}`, ip + 4];
      }
      case Op.LineInfo: {
        const lineNum = this.readU16(ip + 1);
        return [`${prefix}  line=${lineNum}`, ip + 3];
      }
      // No-operand instructions
      default:
        return [`${prefix}`, ip + 1];
    }
  }
}

// ─── Value formatter ──────────────────────────────────────────────────────────

export function formatValue(v: HkdValue): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return String(v);
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `"${v}"`;
  if ((v as HkdFunction).type === "function") return `<fn ${(v as HkdFunction).name}>`;
  if ((v as HkdClosure).type === "closure") return `<closure ${(v as HkdClosure).fn.name}>`;
  if ((v as HkdNativeFunction).type === "native") return `<native ${(v as HkdNativeFunction).name}>`;
  if ((v as HkdArray).type === "array") return `[${(v as HkdArray).elements.map(formatValue).join(", ")}]`;
  if ((v as HkdObject).type === "object") {
    const fields = Array.from((v as HkdObject).fields.entries())
      .map(([k, val]) => `${k}: ${formatValue(val)}`)
      .join(", ");
    return `{${fields}}`;
  }
  return "<value>";
}
