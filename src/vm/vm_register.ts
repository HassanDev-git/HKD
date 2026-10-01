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

import {
  Chunk,
  HkdValue,
  HkdArray,
  HkdObject,
  HkdFunction,
  HkdClosure,
  HkdNativeFunction,
  HkdIterator,
  Upvalue,
  formatValue,
} from "../bytecode/chunk.js";
import { RegisterChunk, RegInstruction, RegOp } from "../bytecode/register_chunk.js";
import { lowerToRegisterChunk } from "../bytecode/register_lowering.js";
import { ErrorCode } from "../errors/index.js";
import { VmError, VmResult } from "./vm.js";

const MAX_CALL_DEPTH = 512;

export interface GlobalCell {
  name: string;
  value: HkdValue;
}

interface RegCallFrame {
  closure: HkdClosure | null;
  chunk: RegisterChunk;
  ip: number;
  registers: HkdValue[];
  destReg: number;
  cells: Array<GlobalCell | undefined>;
}

export class RegisterVM {
  private frames: RegCallFrame[] = [];
  private globals: Map<string, HkdValue> = new Map();
  private globalCells: Map<string, GlobalCell> = new Map();
  private output: (s: string) => void;
  private futureCallbacks: WeakMap<HkdObject, Array<HkdValue>> = new WeakMap();
  private callbackQueue: Array<[HkdValue, HkdValue[]]> = [];
  private isDispatchingCallbacks: boolean = false;
  private regArrayPool: HkdValue[][] = [];
  private framePool: RegCallFrame[] = [];

  constructor(output: (s: string) => void = (s) => process.stdout.write(s + "\n")) {
    this.output = output;
    this.registerBuiltins();
  }

  public dispatchCallback(cb: HkdValue, args: HkdValue[]): void {
    this.callbackQueue.push([cb, args]);
    if (this.isDispatchingCallbacks) return;
    this.isDispatchingCallbacks = true;
    try {
      while (this.callbackQueue.length > 0) {
        const [nextCb, nextArgs] = this.callbackQueue.shift()!;
        this.runCallable(nextCb, nextArgs);
      }
    } finally {
      this.isDispatchingCallbacks = false;
    }
  }

  public runCallable(callee: HkdValue, args: HkdValue[]): HkdValue {
    if (!callee || typeof callee !== "object") {
      throw new VmError("Cannot call non-function", ErrorCode.E408);
    }
    const c = callee as any;
    if (c.type === "native") {
      return (c as HkdNativeFunction).call(args);
    }
    if (c.type === "closure" || c.type === "function") {
      const fn = c.type === "closure" ? (c as HkdClosure).fn : (c as HkdFunction);
      const regChunk: RegisterChunk = (fn as any).registerChunk ?? lowerToRegisterChunk(fn.chunk);
      (fn as any).registerChunk = regChunk;

      const targetFrames = this.frames.length;
      const closure: HkdClosure = c.type === "closure" ? c : { type: "closure", fn, upvalues: [] };
      const regSize = Math.max(regChunk.registerCount + 32, 128);
      const registers = new Array(regSize);
      for (let i = 0; i < args.length; i++) registers[i] = args[i];

      this.pushFrame(closure, regChunk, registers, 0);
      const res = this.execute(targetFrames);
      if (!res.ok) throw new VmError(res.error, res.code);
      return res.value;
    }
    throw new VmError("Cannot call non-function", ErrorCode.E408);
  }

  public getGlobalCell(name: string): GlobalCell {
    let cell = this.globalCells.get(name);
    if (!cell) {
      cell = { name, value: this.globals.has(name) ? this.globals.get(name)! : (undefined as any) };
      this.globalCells.set(name, cell);
    }
    return cell;
  }

  public defineNative(name: string, arity: number, fn: (args: HkdValue[]) => HkdValue): void {
    const native: HkdNativeFunction = {
      type: "native",
      name,
      arity,
      call: fn,
    };
    this.globals.set(name, native);
    const cell = this.globalCells.get(name);
    if (cell) cell.value = native;
  }

  public getGlobal(name: string): HkdValue | undefined {
    const cell = this.globalCells.get(name);
    if (cell !== undefined && cell.value !== undefined) return cell.value;
    return this.globals.get(name);
  }

  public setGlobal(name: string, value: HkdValue): void {
    this.globals.set(name, value);
    const cell = this.globalCells.get(name);
    if (cell) cell.value = value;
  }

  public getAllGlobals(): Array<{ name: string; value: HkdValue }> {
    const map = new Map<string, HkdValue>(this.globals);
    for (const [k, cell] of this.globalCells.entries()) {
      if (cell.value !== undefined) map.set(k, cell.value);
    }
    const list: Array<{ name: string; value: HkdValue }> = [];
    for (const [k, v] of map.entries()) {
      list.push({ name: k, value: v });
    }
    return list;
  }

  public run(chunk: Chunk | RegisterChunk): VmResult {
    let regChunk: RegisterChunk;
    if (chunk instanceof RegisterChunk) {
      regChunk = chunk;
    } else {
      regChunk = lowerToRegisterChunk(chunk);
    }

    const scriptFn: HkdFunction = {
      type: "function",
      name: "<script>",
      arity: 0,
      chunk: null as any,
      upvalueCount: 0,
    };
    (scriptFn as any).registerChunk = regChunk;

    const closure: HkdClosure = {
      type: "closure",
      fn: scriptFn,
      upvalues: [],
    };

    const regSize = Math.max(regChunk.registerCount + 32, 128);
    const registers = new Array(regSize);
    this.pushFrame(closure, regChunk, registers, 0);

    try {
      return this.execute(0);
    } catch (e: any) {
      const code = (e instanceof VmError) ? e.code : ErrorCode.E405;
      const backtrace: string[] = [];
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

  private pushFrame(closure: HkdClosure, chunk: RegisterChunk, registers: HkdValue[], destReg: number): void {
    if (this.frames.length >= MAX_CALL_DEPTH) {
      throw new VmError("Stack overflow (call depth limit reached)", ErrorCode.E404);
    }
    let frame: RegCallFrame;
    if (this.framePool.length > 0) {
      frame = this.framePool.pop()!;
      frame.closure = closure;
      frame.chunk = chunk;
      frame.ip = 0;
      frame.registers = registers;
      frame.destReg = destReg;
      frame.cells.length = 0;
    } else {
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

  private execute(targetFrames: number = 0): VmResult {
    let frame = this.frames[this.frames.length - 1];
    let code = frame.chunk.code;
    let registers = frame.registers;
    let constants = frame.chunk.constants;
    let cells = frame.cells;

    while (true) {
      const ins = code[frame.ip++];

      switch (ins.op) {
        case RegOp.Nop:
          break;

        case RegOp.LoadConst:
          registers[ins.dst] = constants[ins.src1];
          break;

        case RegOp.LoadImm:
          registers[ins.dst] = ins.src1;
          break;

        case RegOp.LoadNull:
          registers[ins.dst] = null;
          break;

        case RegOp.LoadTrue:
          registers[ins.dst] = true;
          break;

        case RegOp.LoadFalse:
          registers[ins.dst] = false;
          break;

        case RegOp.Move:
          registers[ins.dst] = registers[ins.src1];
          break;

        case RegOp.LoadGlobal: {
          const idx = ins.src1;
          let cell = cells[idx];
          if (!cell) {
            const name = constants[idx] as string;
            cell = this.getGlobalCell(name);
            cells[idx] = cell;
          }
          const val = cell.value;
          if (val === undefined && !this.globals.has(cell.name)) {
            throw new VmError(`Undefined variable \`${cell.name}\``, ErrorCode.E301);
          }
          registers[ins.dst] = val!;
          break;
        }

        case RegOp.StoreGlobal: {
          const idx = ins.dst;
          let cell = cells[idx];
          if (!cell) {
            const name = constants[idx] as string;
            cell = this.getGlobalCell(name);
            cells[idx] = cell;
          }
          cell.value = registers[ins.src1];
          break;
        }

        case RegOp.DefineGlobal: {
          const idx = ins.dst;
          let cell = cells[idx];
          if (!cell) {
            const name = constants[idx] as string;
            cell = this.getGlobalCell(name);
            cells[idx] = cell;
          }
          const val = registers[ins.src1];
          cell.value = val;
          this.globals.set(cell.name, val);
          break;
        }

        case RegOp.LoadUpvalue: {
          const uv = frame.closure?.upvalues[ins.src1];
          registers[ins.dst] = uv ? uv.value : null;
          break;
        }

        case RegOp.StoreUpvalue: {
          const uv = frame.closure?.upvalues[ins.dst];
          if (uv) uv.value = registers[ins.src1];
          break;
        }

        case RegOp.CloseUpvalue:
          break;

        // ── Arithmetic ───────────────────────────────────────────────────────
        case RegOp.Add: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a + b;
          } else if (typeof a === "string" && typeof b === "string") {
            registers[ins.dst] = a + b;
          } else if (typeof a === "string" || typeof b === "string") {
            registers[ins.dst] = this.hkdToString(a) + this.hkdToString(b);
          } else {
            throw new VmError(`Cannot add ${typeof a} and ${typeof b}`, ErrorCode.E405);
          }
          break;
        }

        case RegOp.Sub: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a - b;
          } else {
            throw new VmError("Operator '-' requires numbers", ErrorCode.E405);
          }
          break;
        }

        case RegOp.Mul: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a * b;
          } else {
            throw new VmError("Operator '*' requires numbers", ErrorCode.E405);
          }
          break;
        }

        case RegOp.Div: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            if (b === 0) throw new VmError("Division by zero", ErrorCode.E401);
            registers[ins.dst] = a / b;
          } else {
            throw new VmError("Division requires numbers", ErrorCode.E405);
          }
          break;
        }

        case RegOp.Mod: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            if (b === 0) throw new VmError("Modulo by zero", ErrorCode.E401);
            registers[ins.dst] = a % b;
          } else {
            throw new VmError("Modulo requires numbers", ErrorCode.E405);
          }
          break;
        }

        case RegOp.Pow: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = Math.pow(a, b);
          } else {
            throw new VmError("Exponentiation requires numbers", ErrorCode.E405);
          }
          break;
        }

        case RegOp.Neg: {
          const a = registers[ins.src1];
          if (typeof a === "number") {
            registers[ins.dst] = -a;
          } else {
            throw new VmError("Negation requires a number", ErrorCode.E405);
          }
          break;
        }

        // ── Comparison ───────────────────────────────────────────────────────
        case RegOp.Eq: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a === b;
          } else if (typeof a === "boolean" && typeof b === "boolean") {
            registers[ins.dst] = a === b;
          } else {
            registers[ins.dst] = this.hkdEquals(a, b);
          }
          break;
        }

        case RegOp.Ne: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a !== b;
          } else if (typeof a === "boolean" && typeof b === "boolean") {
            registers[ins.dst] = a !== b;
          } else {
            registers[ins.dst] = !this.hkdEquals(a, b);
          }
          break;
        }

        case RegOp.Lt: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a < b;
          } else {
            registers[ins.dst] = this.compareValues(a, b) < 0;
          }
          break;
        }

        case RegOp.Le: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a <= b;
          } else {
            registers[ins.dst] = this.compareValues(a, b) <= 0;
          }
          break;
        }

        case RegOp.Gt: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a > b;
          } else {
            registers[ins.dst] = this.compareValues(a, b) > 0;
          }
          break;
        }

        case RegOp.Ge: {
          const a = registers[ins.src1];
          const b = registers[ins.src2];
          if (typeof a === "number" && typeof b === "number") {
            registers[ins.dst] = a >= b;
          } else {
            registers[ins.dst] = this.compareValues(a, b) >= 0;
          }
          break;
        }

        // ── Logical & Bitwise ────────────────────────────────────────────────
        case RegOp.Not:
          registers[ins.dst] = !this.isTruthy(registers[ins.src1]);
          break;

        case RegOp.BitAnd: {
          const a = this.toInt(registers[ins.src1]);
          const b = this.toInt(registers[ins.src2]);
          registers[ins.dst] = a & b;
          break;
        }

        case RegOp.BitOr: {
          const a = this.toInt(registers[ins.src1]);
          const b = this.toInt(registers[ins.src2]);
          registers[ins.dst] = a | b;
          break;
        }

        case RegOp.BitXor: {
          const a = this.toInt(registers[ins.src1]);
          const b = this.toInt(registers[ins.src2]);
          registers[ins.dst] = a ^ b;
          break;
        }

        case RegOp.BitNot:
          registers[ins.dst] = ~this.toInt(registers[ins.src1]);
          break;

        case RegOp.Shl: {
          const a = this.toInt(registers[ins.src1]);
          const b = this.toInt(registers[ins.src2]);
          registers[ins.dst] = a << b;
          break;
        }

        case RegOp.Shr: {
          const a = this.toInt(registers[ins.src1]);
          const b = this.toInt(registers[ins.src2]);
          registers[ins.dst] = a >> b;
          break;
        }

        // ── Jumps ────────────────────────────────────────────────────────────
        case RegOp.Jump:
          frame.ip = ins.dst;
          break;

        case RegOp.JumpIf: {
          const cond = registers[ins.dst];
          if (cond === true || (cond && cond !== 0 && cond !== "")) {
            frame.ip = ins.src2;
          }
          break;
        }

        case RegOp.JumpIfNot: {
          const cond = registers[ins.dst];
          if (cond !== true && (!cond || cond === 0 || cond === "")) {
            frame.ip = ins.src2;
          }
          break;
        }

        case RegOp.JumpNull: {
          if (registers[ins.dst] === null) {
            frame.ip = ins.src2;
          }
          break;
        }

        // ── Functions & Calls ────────────────────────────────────────────────
        case RegOp.Call: {
          const callee = registers[ins.src1];
          const argc: number = ins.extra?.argc ?? 0;
          const argStart: number = ins.src2;

          if (callee === null || callee === undefined) {
            throw new VmError("Cannot call null", ErrorCode.E408);
          }

          const c = callee as any;

          if (c.type === "native") {
            const native = c as HkdNativeFunction;
            if (native.arity >= 0 && native.arity !== argc) {
              throw new VmError(
                `${native.name}() expects ${native.arity} argument(s), got ${argc}`,
                ErrorCode.E307
              );
            }
            const args = registers.slice(argStart, argStart + argc);
            registers[ins.dst] = native.call(args);
            break;
          }

          let fn: HkdFunction;
          let closure: HkdClosure;

          if (c.type === "function") {
            fn = c as HkdFunction;
            closure = (fn as any)._defaultClosure;
            if (!closure) {
              closure = { type: "closure", fn, upvalues: [] };
              (fn as any)._defaultClosure = closure;
            }
          } else if (c.type === "closure") {
            closure = c as HkdClosure;
            fn = closure.fn;
          } else {
            throw new VmError(`\`${formatValue(callee)}\` is not callable`, ErrorCode.E408);
          }

          if (fn.arity !== argc) {
            throw new VmError(
              `${fn.name}() expects ${fn.arity} argument(s), got ${argc}`,
              ErrorCode.E307
            );
          }

          let targetChunk: RegisterChunk = (fn as any).registerChunk;
          if (!targetChunk) {
            targetChunk = lowerToRegisterChunk(fn.chunk);
            (fn as any).registerChunk = targetChunk;
          }

          // Tail call optimization for self-recursion
          if (frame.ip < code.length && code[frame.ip].op === RegOp.Return && targetChunk === frame.chunk) {
            for (let i = 0; i < argc; i++) {
              registers[i] = registers[argStart + i];
            }
            frame.ip = 0;
            break;
          }

          const regSize = Math.max(targetChunk.registerCount + 32, 128);
          let newRegs: HkdValue[];
          if (this.regArrayPool.length > 0 && this.regArrayPool[this.regArrayPool.length - 1].length >= regSize) {
            newRegs = this.regArrayPool.pop()!;
          } else {
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

        case RegOp.Return: {
          const returnValue = registers[ins.dst];
          const returnFrame = this.frames.pop()!;
          if (this.regArrayPool.length < 256) {
            this.regArrayPool.push(returnFrame.registers);
          }
          if (this.framePool.length < 256) {
            returnFrame.closure = null;
            returnFrame.registers = null as any;
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

        case RegOp.MakeClosure: {
          const fn = constants[ins.src1] as HkdFunction;
          const upvaluesData: Array<{ isLocal: boolean; index: number }> = ins.extra?.upvaluesData ?? [];
          const upvalues: Upvalue[] = [];

          for (const u of upvaluesData) {
            if (u.isLocal) {
              upvalues.push({
                value: registers[u.index],
                closed: false,
                stackIndex: u.index,
              });
            } else {
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
        case RegOp.MakeArray: {
          const elements = registers.slice(ins.src1, ins.src1 + ins.src2);
          registers[ins.dst] = { type: "array", elements };
          break;
        }

        case RegOp.GetIndex:
          registers[ins.dst] = this.getIndex(registers[ins.src1], registers[ins.src2]);
          break;

        case RegOp.SetIndex:
          this.setIndex(registers[ins.dst], registers[ins.src1], registers[ins.src2]);
          break;

        case RegOp.ArrayLen:
          registers[ins.dst] = this.getArrayLen(registers[ins.src1]);
          break;

        case RegOp.MakeObject: {
          const pairCount = ins.src2;
          const startReg = ins.src1;
          const fields = new Map<string, HkdValue>();
          for (let i = 0; i < pairCount; i++) {
            const k = registers[startReg + i * 2] as string;
            const v = registers[startReg + i * 2 + 1];
            fields.set(k, v);
          }
          registers[ins.dst] = { type: "object", fields };
          break;
        }

        case RegOp.GetField: {
          const fieldName = constants[ins.src2] as string;
          registers[ins.dst] = this.getField(registers[ins.src1], fieldName);
          break;
        }

        case RegOp.SetField: {
          const fieldName = constants[ins.src1] as string;
          this.setField(registers[ins.dst], fieldName, registers[ins.src2]);
          break;
        }

        // ── Iterators & String ───────────────────────────────────────────────
        case RegOp.MakeIter:
          registers[ins.dst] = this.makeIterator(registers[ins.src1]);
          break;

        case RegOp.IterNext: {
          const iter = registers[ins.src1] as HkdIterator;
          if (!iter || iter.type !== "iterator") {
            throw new VmError("IterNext requires an iterator", ErrorCode.E405);
          }
          const result = iter.next();
          if (result.done) {
            frame.ip = ins.src2;
          } else {
            registers[ins.dst] = result.value!;
          }
          break;
        }

        case RegOp.Concat: {
          const parts = registers.slice(ins.src1, ins.src1 + ins.src2);
          registers[ins.dst] = parts.map((p) => this.hkdToString(p)).join("");
          break;
        }

        case RegOp.Halt:
          return { ok: true, value: ins.dst >= 0 ? (registers[ins.dst] ?? null) : null };

        default:
          throw new VmError(`Unknown register opcode: ${ins.op}`, ErrorCode.E503);
      }
    }
  }

  // ── Value Helpers ──────────────────────────────────────────────────────────

  private toInt(v: HkdValue): number {
    if (typeof v !== "number") throw new VmError("Expected integer", ErrorCode.E405);
    return v | 0;
  }

  private isTruthy(v: HkdValue): boolean {
    if (v === null || v === false) return false;
    if (v === 0 || v === "") return false;
    return true;
  }

  private hkdEquals(a: HkdValue, b: HkdValue): boolean {
    if (a === null && b === null) return true;
    if (a === null || b === null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === "number" || typeof a === "string" || typeof a === "boolean") {
      return a === b;
    }
    if ((a as HkdArray).type === "array" && (b as HkdArray).type === "array") {
      const aa = (a as HkdArray).elements;
      const ba = (b as HkdArray).elements;
      if (aa.length !== ba.length) return false;
      return aa.every((v, i) => this.hkdEquals(v, ba[i]));
    }
    return a === b;
  }

  private compareValues(a: HkdValue, b: HkdValue): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    if (typeof a === "string" && typeof b === "string") return a < b ? -1 : a > b ? 1 : 0;
    throw new VmError(`Cannot compare ${typeof a} and ${typeof b}`, ErrorCode.E405);
  }

  private hkdToString(v: HkdValue): string {
    if (v === null) return "null";
    if (typeof v === "boolean") return String(v);
    if (typeof v === "number") {
      if (Number.isInteger(v)) return String(v);
      return String(v);
    }
    if (typeof v === "string") return v;
    return formatValue(v);
  }

  private getIndex(obj: HkdValue, index: HkdValue): HkdValue {
    if ((obj as HkdArray)?.type === "array") {
      const arr = obj as HkdArray;
      if (typeof index !== "number") throw new VmError("Array index must be an Int", ErrorCode.E405);
      const i = index < 0 ? arr.elements.length + index : index;
      if (i < 0 || i >= arr.elements.length) {
        throw new VmError(
          `Index ${index} out of bounds for array of length ${arr.elements.length}`,
          ErrorCode.E402
        );
      }
      return arr.elements[i];
    }
    if (typeof obj === "string") {
      if (typeof index !== "number") throw new VmError("String index must be an Int", ErrorCode.E405);
      return obj[index] ?? null;
    }
    if ((obj as HkdObject)?.type === "object") {
      if (typeof index !== "string") throw new VmError("Object key must be a String", ErrorCode.E405);
      return (obj as HkdObject).fields.get(index) ?? null;
    }
    throw new VmError(`Cannot index ${typeof obj}`, ErrorCode.E405);
  }

  private setIndex(obj: HkdValue, index: HkdValue, value: HkdValue): void {
    if ((obj as HkdArray)?.type === "array") {
      const arr = obj as HkdArray;
      if (typeof index !== "number") throw new VmError("Array index must be an Int", ErrorCode.E405);
      arr.elements[index] = value;
      return;
    }
    if ((obj as HkdObject)?.type === "object") {
      if (typeof index !== "string") throw new VmError("Object key must be a String", ErrorCode.E405);
      (obj as HkdObject).fields.set(index, value);
      return;
    }
    throw new VmError(`Cannot index-assign ${typeof obj}`, ErrorCode.E405);
  }

  private getArrayLen(arr: HkdValue): number {
    if ((arr as HkdArray)?.type === "array") return (arr as HkdArray).elements.length;
    if (typeof arr === "string") return arr.length;
    throw new VmError("len() requires an array or string", ErrorCode.E405);
  }

  private getField(obj: HkdValue, field: string): HkdValue {
    if ((obj as HkdObject)?.type === "object") {
      const val = (obj as HkdObject).fields.get(field);
      if (val !== undefined) return val;
      const typeName = (obj as HkdObject).fields.get("__type__");
      if (typeof typeName === "string") {
        const methodGlobal = this.globals.get(`${typeName}__${field}`);
        if (methodGlobal) {
          return {
            type: "native",
            name: `${typeName}.${field}`,
            arity: -1,
            call: (args: HkdValue[]) => {
              return this.runCallable(methodGlobal, [obj, ...args]);
            },
          } as HkdNativeFunction;
        }
      }
      return null;
    }
    if ((obj as HkdArray)?.type === "array") {
      if (field === "length") return (obj as HkdArray).elements.length;
      if (field === "push") {
        const arr = obj as HkdArray;
        return {
          type: "native",
          name: "push",
          arity: 1,
          call: (args) => { arr.elements.push(args[0]); return null; },
        } as HkdNativeFunction;
      }
      if (field === "pop") {
        const arr = obj as HkdArray;
        return {
          type: "native",
          name: "pop",
          arity: 0,
          call: () => arr.elements.pop() ?? null,
        } as HkdNativeFunction;
      }
      if (field === "join") {
        const arr = obj as HkdArray;
        return {
          type: "native",
          name: "join",
          arity: 1,
          call: (args) => arr.elements.map((e) => this.hkdToString(e)).join(args[0] as string ?? ""),
        } as HkdNativeFunction;
      }
    }
    if (typeof obj === "string") {
      if (field === "length") return obj.length;
      if (field === "upper") return { type: "native", name: "upper", arity: 0, call: () => obj.toUpperCase() } as HkdNativeFunction;
      if (field === "lower") return { type: "native", name: "lower", arity: 0, call: () => obj.toLowerCase() } as HkdNativeFunction;
      if (field === "trim") return { type: "native", name: "trim", arity: 0, call: () => obj.trim() } as HkdNativeFunction;
      if (field === "split") return { type: "native", name: "split", arity: 1, call: (a) => ({ type: "array", elements: obj.split(a[0] as string) }) } as HkdNativeFunction;
      if (field === "contains") return { type: "native", name: "contains", arity: 1, call: (a) => obj.includes(a[0] as string) } as HkdNativeFunction;
      if (field === "starts_with") return { type: "native", name: "starts_with", arity: 1, call: (a) => obj.startsWith(a[0] as string) } as HkdNativeFunction;
      if (field === "ends_with") return { type: "native", name: "ends_with", arity: 1, call: (a) => obj.endsWith(a[0] as string) } as HkdNativeFunction;
      if (field === "replace") return { type: "native", name: "replace", arity: 2, call: (a) => obj.replace(a[0] as string, a[1] as string) } as HkdNativeFunction;
    }
    return null;
  }

  private setField(obj: HkdValue, field: string, value: HkdValue): void {
    if ((obj as HkdObject)?.type === "object") {
      (obj as HkdObject).fields.set(field, value);
      return;
    }
    throw new VmError(`Cannot set field on ${typeof obj}`, ErrorCode.E405);
  }

  private makeIterator(value: HkdValue): HkdIterator {
    if ((value as HkdArray)?.type === "array") {
      const elements = (value as HkdArray).elements;
      let i = 0;
      return {
        type: "iterator",
        next: () => {
          if (i < elements.length) return { value: elements[i++], done: false };
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
          if (i < chars.length) return { value: chars[i++], done: false };
          return { value: null, done: true };
        },
      };
    }
    throw new VmError(`Value is not iterable`, ErrorCode.E405);
  }

  private registerBuiltins(): void {
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
      if ((v as HkdArray)?.type === "array") return (v as HkdArray).elements.length;
      if (typeof v === "string") return v.length;
      if ((v as HkdObject)?.type === "object") return (v as HkdObject).fields.size;
      throw new VmError(`len() not supported for ${typeof v}`, ErrorCode.E405);
    });

    this.defineNative("type_of", 1, (args) => {
      const v = args[0];
      if (v === null) return "null";
      if (typeof v === "boolean") return "Bool";
      if (typeof v === "number") return Number.isInteger(v) ? "Int" : "Float";
      if (typeof v === "string") return "String";
      if ((v as HkdArray)?.type === "array") return "Array";
      if ((v as HkdFunction)?.type === "function") return "Function";
      if ((v as HkdClosure)?.type === "closure") return "Function";
      if ((v as HkdNativeFunction)?.type === "native") return "Function";
      return "Object";
    });

    this.defineNative("to_string", 1, (args) => this.hkdToString(args[0]));

    this.defineNative("to_int", 1, (args) => {
      const v = args[0];
      if (typeof v === "number") return Math.trunc(v);
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (isNaN(n)) throw new VmError(`Cannot convert "${v}" to Int`, ErrorCode.E405);
        return n;
      }
      if (typeof v === "boolean") return v ? 1 : 0;
      throw new VmError(`Cannot convert to Int`, ErrorCode.E405);
    });

    this.defineNative("to_float", 1, (args) => {
      const v = args[0];
      if (typeof v === "number") return v;
      if (typeof v === "string") {
        const n = parseFloat(v);
        if (isNaN(n)) throw new VmError(`Cannot convert "${v}" to Float`, ErrorCode.E405);
        return n;
      }
      throw new VmError(`Cannot convert to Float`, ErrorCode.E405);
    });

    this.defineNative("to_bool", 1, (args) => this.isTruthy(args[0]));

    this.defineNative("exit", 1, (args) => {
      process.exit(typeof args[0] === "number" ? args[0] : 0);
    });

    this.defineNative("range", 2, (args) => {
      const start = args[0] as number;
      const end   = args[1] as number;
      const elements: HkdValue[] = [];
      for (let i = start; i < end; i++) elements.push(i);
      return { type: "array", elements };
    });

    this.defineNative("panic", 1, (args) => {
      throw new VmError(this.hkdToString(args[0]), ErrorCode.E405);
    });

    this.defineNative("__assert__", 2, (args) => {
      if (!this.isTruthy(args[0])) {
        throw new VmError(
          `Assertion failed: ${this.hkdToString(args[1])}`,
          ErrorCode.E405
        );
      }
      return null;
    });

    this.defineNative("assert", -1, (args) => {
      if (!this.isTruthy(args[0])) {
        const msg = args[1] ? this.hkdToString(args[1]) : "Assertion failed";
        throw new VmError(msg, ErrorCode.E405);
      }
      return null;
    });

    this.defineNative("__register_test__", 2, (_args) => null);
    this.defineNative("__import__", 1, (_args) => null);

    // Async / Future primitives
    this.defineNative("__hkd_future", 1, (args) => {
      const initVal = args[0] !== undefined ? args[0] : null;
      const isResolved = initVal !== null && initVal !== undefined;
      const fields = new Map<string, HkdValue>();
      fields.set("__type__", "Future");
      fields.set("state", isResolved ? "resolved" : "pending");
      fields.set("value", initVal);
      fields.set("error", null);
      const fut: HkdObject = { type: "object", fields };
      this.futureCallbacks.set(fut, []);
      return fut;
    });

    this.defineNative("__hkd_is_pending", 1, (args) => {
      const v = args[0];
      if (v && typeof v === "object" && (v as any).type === "object") {
        return (v as HkdObject).fields.get("state") === "pending";
      }
      return false;
    });

    this.defineNative("__hkd_is_rejected", 1, (args) => {
      const v = args[0];
      if (v && typeof v === "object" && (v as any).type === "object") {
        return (v as HkdObject).fields.get("state") === "rejected";
      }
      return false;
    });

    this.defineNative("__hkd_error", 1, (args) => {
      const v = args[0];
      if (v && typeof v === "object" && (v as any).type === "object") {
        return (v as HkdObject).fields.get("error") ?? null;
      }
      return null;
    });

    this.defineNative("__hkd_unwrap", 1, (args) => {
      const v = args[0];
      if (v && typeof v === "object" && (v as any).type === "object" && (v as HkdObject).fields.get("__type__") === "Future") {
        const obj = v as HkdObject;
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
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        if (obj.fields.get("state") !== "pending") return fut;
        obj.fields.set("state", "resolved");
        obj.fields.set("value", val);
        const cbs = this.futureCallbacks.get(obj);
        if (cbs) {
          this.futureCallbacks.delete(obj);
          for (const cb of cbs) this.dispatchCallback(cb, [val]);
        }
      }
      return fut;
    });

    this.defineNative("__hkd_reject", 2, (args) => {
      const fut = args[0];
      const err = args[1] !== undefined ? args[1] : null;
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        if (obj.fields.get("state") !== "pending") return fut;
        obj.fields.set("state", "rejected");
        obj.fields.set("error", err);
        const cbs = this.futureCallbacks.get(obj);
        if (cbs) {
          this.futureCallbacks.delete(obj);
          for (const cb of cbs) this.dispatchCallback(cb, [null]);
        }
      }
      return fut;
    });

    this.defineNative("__hkd_on_complete", 2, (args) => {
      const fut = args[0];
      const cb = args[1];
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        const state = obj.fields.get("state");
        if (state === "resolved") {
          this.dispatchCallback(cb, [obj.fields.get("value") ?? null]);
        } else if (state === "rejected") {
          this.dispatchCallback(cb, [null]);
        } else {
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
