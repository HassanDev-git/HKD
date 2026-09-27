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

import { Op } from "../bytecode/opcodes.js";
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
import { ErrorCode } from "../errors/index.js";

// ─── VM configuration ─────────────────────────────────────────────────────────

const MAX_STACK_DEPTH = 2048;
const MAX_CALL_DEPTH  = 512;

// ─── Call frame ───────────────────────────────────────────────────────────────

interface CallFrame {
  closure: HkdClosure | null;
  chunk: Chunk;
  ip: number;
  base: number;       // index into value stack where this frame's locals start
  openUpvalues: Upvalue[];
}

// ─── VM Result ────────────────────────────────────────────────────────────────

export type VmResult =
  | { ok: true;  value: HkdValue }
  | { ok: false; error: string; code: ErrorCode };

export interface VmDebugger {
  onBeforeInstruction?(vm: VM, frame: CallFrame, op: number, line: number): "pause" | "continue" | void;
}

// ─── VM ───────────────────────────────────────────────────────────────────────

export class VM {
  private stack: HkdValue[] = [];
  private frames: CallFrame[] = [];
  private globals: Map<string, HkdValue> = new Map();
  private output: (s: string) => void;
  private dbg: VmDebugger | null = null;
  public isPaused: boolean = false;
  private futureCallbacks: WeakMap<HkdObject, Array<HkdValue>> = new WeakMap();

  constructor(output: (s: string) => void = (s) => process.stdout.write(s + "\n")) {
    this.output = output;
    this.registerBuiltins();
  }

  public setDebugger(dbg: VmDebugger | null): void {
    this.dbg = dbg;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  run(chunk: Chunk): VmResult {
    // Wrap top-level script in a synthetic closure
    const scriptFn: HkdFunction = {
      type: "function",
      name: "<script>",
      arity: 0,
      chunk,
      upvalueCount: 0,
    };
    const closure: HkdClosure = {
      type: "closure",
      fn: scriptFn,
      upvalues: [],
    };

    this.pushFrame(closure, 0);

    try {
      return this.execute();
    } catch (e) {
      if (e instanceof VmError) {
        const backtrace: string[] = [];
        for (let i = this.frames.length - 1; i >= 0; i--) {
          const frame = this.frames[i];
          const ip = frame.ip;
          const line = (ip > 0 && ip - 1 < frame.chunk.lines.length) ? frame.chunk.lines[ip - 1] : 0;
          backtrace.push(`  at ${frame.closure?.fn.name ?? "<unknown>"} (line: ${line})`);
        }
        const fullMessage = e.message + (backtrace.length > 0 ? "\n" + backtrace.join("\n") : "");
        return { ok: false, error: fullMessage, code: e.code };
      }
      throw e;
    }
  }

  /** Register a native function in the global scope. */
  defineNative(name: string, arity: number, fn: (args: HkdValue[]) => HkdValue): void {
    const native: HkdNativeFunction = {
      type: "native",
      name,
      arity,
      call: fn,
    };
    this.globals.set(name, native);
  }

  /** Read a global value. */
  getGlobal(name: string): HkdValue | undefined {
    return this.globals.get(name);
  }

  /** Set a global value. */
  setGlobal(name: string, value: HkdValue): void {
    this.globals.set(name, value);
  }

  public resume(): VmResult {
    this.isPaused = false;
    return this.execute();
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
      const targetFrames = this.frames.length;
      this.push(callee);
      for (const a of args) this.push(a);
      this.callValue(callee, args.length);
      const res = this.execute(targetFrames);
      if (!res.ok) {
        throw new VmError(res.error, res.code);
      }
      return res.value;
    }
    throw new VmError("Cannot call non-function", ErrorCode.E408);
  }

  public getCallFrames(): Array<{ name: string; line: number; frameIndex: number }> {
    return this.frames.map((f, idx) => ({
      name: f.closure?.fn.name || "<script>",
      line: (f.ip > 0 && f.ip - 1 < f.chunk.lines.length) ? f.chunk.lines[f.ip - 1] : (f.chunk.lines[f.ip] || 0),
      frameIndex: idx,
    }));
  }

  public getFrameLocals(frameIndex: number): Array<{ name: string; value: HkdValue }> {
    if (frameIndex < 0 || frameIndex >= this.frames.length) return [];
    const frame = this.frames[frameIndex];
    const nextBase = frameIndex + 1 < this.frames.length ? this.frames[frameIndex + 1].base : this.stack.length;
    const locals: Array<{ name: string; value: HkdValue }> = [];
    for (let i = frame.base; i < nextBase; i++) {
      locals.push({
        name: `slot_${i - frame.base}`,
        value: this.stack[i],
      });
    }
    return locals;
  }

  public getAllGlobals(): Array<{ name: string; value: HkdValue }> {
    const list: Array<{ name: string; value: HkdValue }> = [];
    for (const [k, v] of this.globals.entries()) {
      list.push({ name: k, value: v });
    }
    return list;
  }

  private getConstant(frame: CallFrame, idx: number): HkdValue {
    if (idx < 0 || idx >= frame.chunk.constants.length) {
      throw new VmError(
        `Bytecode safety violation: constant index ${idx} out of bounds (constant pool size: ${frame.chunk.constants.length})`,
        ErrorCode.E401
      );
    }
    return frame.chunk.constants[idx];
  }

  // ── Main execution loop ────────────────────────────────────────────────────

  private execute(targetFrames: number = 0): VmResult {
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
        case Op.LoadConst: {
          const idx = this.readU16();
          this.push(this.getConstant(frame, idx));
          break;
        }
        case Op.LoadNull:  this.push(null); break;
        case Op.LoadTrue:  this.push(true); break;
        case Op.LoadFalse: this.push(false); break;
        case Op.Pop:       this.pop(); break;
        case Op.Dup:       this.push(this.peek(0)); break;

        // ── Locals ────────────────────────────────────────────────────────
        case Op.LoadLocal: {
          const slot = this.readU16();
          this.push(this.stack[frame.base + slot]);
          break;
        }
        case Op.StoreLocal: {
          const slot = this.readU16();
          this.stack[frame.base + slot] = this.peek(0);
          break;
        }
        case Op.DefineLocal: {
          const slot = this.readU16();
          this.stack[frame.base + slot] = this.pop();
          break;
        }

        // ── Globals ───────────────────────────────────────────────────────
        case Op.LoadGlobal: {
          const nameIdx = this.readU16();
          const name = this.getConstant(frame, nameIdx) as string;
          if (!this.globals.has(name)) {
            throw new VmError(
              `Undefined variable \`${name}\``,
              ErrorCode.E301
            );
          }
          this.push(this.globals.get(name)!);
          break;
        }
        case Op.StoreGlobal: {
          const nameIdx = this.readU16();
          const name = this.getConstant(frame, nameIdx) as string;
          this.globals.set(name, this.peek(0));
          break;
        }
        case Op.DefineGlobal: {
          const nameIdx = this.readU16();
          const name = this.getConstant(frame, nameIdx) as string;
          this.globals.set(name, this.pop());
          break;
        }

        // ── Upvalues ──────────────────────────────────────────────────────
        case Op.LoadUpvalue: {
          const idx = this.readU16();
          const uv = frame.closure?.upvalues[idx];
          this.push(uv ? uv.value : null);
          break;
        }
        case Op.StoreUpvalue: {
          const idx = this.readU16();
          const uv = frame.closure?.upvalues[idx];
          if (uv) uv.value = this.peek(0);
          break;
        }
        case Op.CloseUpvalue: {
          // Close upvalue — value already captured
          this.pop();
          break;
        }

        // ── Arithmetic ────────────────────────────────────────────────────
        case Op.Add: {
          const b = this.pop();
          const a = this.pop();
          if (typeof a === "string" || typeof b === "string") {
            this.push(this.hkdToString(a) + this.hkdToString(b));
          } else if (typeof a === "number" && typeof b === "number") {
            this.push(a + b);
          } else {
            throw new VmError(`Cannot add ${typeof a} and ${typeof b}`, ErrorCode.E405);
          }
          break;
        }
        case Op.Sub: this.numericOp("-"); break;
        case Op.Mul: this.numericOp("*"); break;
        case Op.Div: {
          const b = this.pop();
          const a = this.pop();
          if (typeof a === "number" && typeof b === "number") {
            if (b === 0) throw new VmError("Division by zero", ErrorCode.E401);
            this.push(a / b);
          } else {
            throw new VmError("Division requires numbers", ErrorCode.E405);
          }
          break;
        }
        case Op.Mod: {
          const b = this.pop();
          const a = this.pop();
          if (typeof a === "number" && typeof b === "number") {
            if (b === 0) throw new VmError("Modulo by zero", ErrorCode.E401);
            this.push(a % b);
          } else {
            throw new VmError("Modulo requires numbers", ErrorCode.E405);
          }
          break;
        }
        case Op.Pow: {
          const b = this.pop();
          const a = this.pop();
          if (typeof a === "number" && typeof b === "number") {
            this.push(Math.pow(a, b));
          } else {
            throw new VmError("Exponentiation requires numbers", ErrorCode.E405);
          }
          break;
        }
        case Op.Neg: {
          const a = this.pop();
          if (typeof a === "number") this.push(-a);
          else throw new VmError("Negation requires a number", ErrorCode.E405);
          break;
        }

        // ── Comparison ────────────────────────────────────────────────────
        case Op.Eq: {
          const b = this.pop(), a = this.pop();
          this.push(this.hkdEquals(a, b));
          break;
        }
        case Op.Ne: {
          const b = this.pop(), a = this.pop();
          this.push(!this.hkdEquals(a, b));
          break;
        }
        case Op.Lt: { const b = this.pop(), a = this.pop(); this.push(this.compareValues(a, b) < 0); break; }
        case Op.Le: { const b = this.pop(), a = this.pop(); this.push(this.compareValues(a, b) <= 0); break; }
        case Op.Gt: { const b = this.pop(), a = this.pop(); this.push(this.compareValues(a, b) > 0); break; }
        case Op.Ge: { const b = this.pop(), a = this.pop(); this.push(this.compareValues(a, b) >= 0); break; }

        // ── Logical ───────────────────────────────────────────────────────
        case Op.Not: this.push(!this.isTruthy(this.pop())); break;

        // ── Bitwise ───────────────────────────────────────────────────────
        case Op.BitAnd: { const b = this.popInt(), a = this.popInt(); this.push(a & b); break; }
        case Op.BitOr:  { const b = this.popInt(), a = this.popInt(); this.push(a | b); break; }
        case Op.BitXor: { const b = this.popInt(), a = this.popInt(); this.push(a ^ b); break; }
        case Op.BitNot: this.push(~this.popInt()); break;
        case Op.Shl:    { const b = this.popInt(), a = this.popInt(); this.push(a << b); break; }
        case Op.Shr:    { const b = this.popInt(), a = this.popInt(); this.push(a >> b); break; }

        // ── Jumps ─────────────────────────────────────────────────────────
        case Op.Jump: {
          const offset = frame.chunk.readI16(frame.ip);
          frame.ip += 2 + offset;
          break;
        }
        case Op.JumpFalse: {
          const offset = frame.chunk.readI16(frame.ip);
          frame.ip += 2;
          if (!this.isTruthy(this.peek(0))) frame.ip += offset;
          break;
        }
        case Op.JumpTrue: {
          const offset = frame.chunk.readI16(frame.ip);
          frame.ip += 2;
          if (this.isTruthy(this.peek(0))) frame.ip += offset;
          break;
        }
        case Op.JumpNull: {
          const offset = frame.chunk.readI16(frame.ip);
          frame.ip += 2;
          if (this.peek(0) === null) frame.ip += offset;
          break;
        }

        // ── Functions ─────────────────────────────────────────────────────
        case Op.Call: {
          const argc = frame.chunk.readByte(frame.ip++);
          const callee = this.peek(argc);

          // Self-tail call optimization
          if (frame.ip < frame.chunk.code.length && frame.chunk.code[frame.ip] === Op.Return) {
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
        case Op.Return: {
          const returnValue = this.pop();
          const returnFrame = this.frames.pop()!;
          // Restore stack to before the call
          this.stack.length = Math.max(0, returnFrame.base - 1);

          if (this.frames.length === targetFrames) {
            return { ok: true, value: returnValue };
          }

          this.push(returnValue);
          break;
        }
        case Op.MakeClosure: {
          const fnIdx = this.readU16();
          const upCount = frame.chunk.readByte(frame.ip++);
          const fn = this.getConstant(frame, fnIdx) as HkdFunction;
          const upvalues: Upvalue[] = [];

          for (let i = 0; i < upCount; i++) {
            const isLocal = frame.chunk.readByte(frame.ip++) === 1;
            const idx = this.readU16();
            if (isLocal) {
              upvalues.push({
                value: this.stack[frame.base + idx],
                closed: false,
                stackIndex: idx,
              });
            } else {
              upvalues.push(frame.closure?.upvalues[idx] ?? {
                value: null,
                closed: true,
                stackIndex: -1,
              });
            }
          }

          const closure: HkdClosure = { type: "closure", fn, upvalues };
          this.push(closure);
          break;
        }

        // ── Arrays ────────────────────────────────────────────────────────
        case Op.MakeArray: {
          const n = this.readU16();
          const elements = this.stack.splice(this.stack.length - n, n);
          const arr: HkdArray = { type: "array", elements };
          this.push(arr);
          break;
        }
        case Op.GetIndex: {
          const index = this.pop();
          const obj = this.pop();
          this.push(this.getIndex(obj, index));
          break;
        }
        case Op.SetIndex: {
          const index = this.pop();
          const obj = this.pop();
          const value = this.peek(0); // leave value on stack
          this.setIndex(obj, index, value);
          break;
        }
        case Op.ArrayLen: {
          const arr = this.pop();
          if ((arr as HkdArray)?.type === "array") {
            this.push((arr as HkdArray).elements.length);
          } else if (typeof arr === "string") {
            this.push(arr.length);
          } else {
            throw new VmError("len() requires an array or string", ErrorCode.E405);
          }
          break;
        }

        // ── Objects ───────────────────────────────────────────────────────
        case Op.MakeObject: {
          const n = this.readU16();
          const pairs = this.stack.splice(this.stack.length - n * 2, n * 2);
          const fields = new Map<string, HkdValue>();
          for (let i = 0; i < pairs.length; i += 2) {
            fields.set(pairs[i] as string, pairs[i + 1]);
          }
          const obj: HkdObject = { type: "object", fields };
          this.push(obj);
          break;
        }
        case Op.GetField: {
          const nameIdx = this.readU16();
          const fieldName = this.getConstant(frame, nameIdx) as string;
          const obj = this.pop();
          this.push(this.getField(obj, fieldName));
          break;
        }
        case Op.SetField: {
          const nameIdx = this.readU16();
          const fieldName = this.getConstant(frame, nameIdx) as string;
          const obj = this.pop();
          const value = this.peek(0); // leave on stack
          if ((obj as HkdObject)?.type === "object") {
            (obj as HkdObject).fields.set(fieldName, value);
          } else {
            throw new VmError(`Cannot set field on ${typeof obj}`, ErrorCode.E405);
          }
          break;
        }

        // ── Iteration ─────────────────────────────────────────────────────
        case Op.MakeIter: {
          const value = this.pop();
          const iter = this.makeIterator(value);
          this.push(iter);
          break;
        }
        case Op.IterNext: {
          const offset = frame.chunk.readI16(frame.ip);
          frame.ip += 2;
          const iter = this.peek(0) as HkdIterator;
          if (!iter || iter.type !== "iterator") {
            throw new VmError("IterNext requires an iterator", ErrorCode.E405);
          }
          const result = iter.next();
          if (result.done) {
            // Pop the iterator and jump past the loop
            this.pop();
            frame.ip += offset;
          } else {
            this.push(result.value!);
          }
          break;
        }

        // ── String ────────────────────────────────────────────────────────
        case Op.Concat: {
          const n = this.readU16();
          const parts = this.stack.splice(this.stack.length - n, n);
          this.push(parts.map((p) => this.hkdToString(p)).join(""));
          break;
        }

        // ── Debug ─────────────────────────────────────────────────────────
        case Op.LineInfo: {
          this.readU16(); // consume line number (used by debugger, ignore here)
          break;
        }

        case Op.Halt:
          return { ok: true, value: this.stack.length > 0 ? this.pop() : null };

        default:
          throw new VmError(
            `Unknown opcode: 0x${op.toString(16)}`,
            ErrorCode.E503
          );
      }
    }
  }

  // ── Call helpers ──────────────────────────────────────────────────────────

  private callValue(callee: HkdValue, argc: number): void {
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
      const args = this.stack.splice(this.stack.length - argc - 1, argc + 1);
      const result = native.call(args.slice(1)); // args[0] is the function itself
      this.push(result);
      return;
    }

    if (c.type === "function") {
      const fn = c as HkdFunction;
      const closure: HkdClosure = { type: "closure", fn, upvalues: [] };
      const base = this.stack.length - argc;
      this.pushFrame(closure, base);
      return;
    }

    if (c.type === "closure") {
      const closure = c as HkdClosure;
      if (closure.fn.arity !== argc) {
        throw new VmError(
          `${closure.fn.name}() expects ${closure.fn.arity} argument(s), got ${argc}`,
          ErrorCode.E307
        );
      }
      const base = this.stack.length - argc;
      this.pushFrame(closure, base);
      return;
    }

    throw new VmError(`\`${formatValue(callee)}\` is not callable`, ErrorCode.E408);
  }

  private pushFrame(closure: HkdClosure, base: number): void {
    if (this.frames.length >= MAX_CALL_DEPTH) {
      throw new VmError("Stack overflow (call depth limit reached)", ErrorCode.E404);
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

  private push(value: HkdValue): void {
    if (this.stack.length >= MAX_STACK_DEPTH) {
      throw new VmError("Stack overflow", ErrorCode.E404);
    }
    this.stack.push(value);
  }

  private pop(): HkdValue {
    if (this.stack.length === 0) {
      throw new VmError("Stack underflow", ErrorCode.E502);
    }
    return this.stack.pop()!;
  }

  private peek(distance: number): HkdValue {
    return this.stack[this.stack.length - 1 - distance];
  }

  private popInt(): number {
    const v = this.pop();
    if (typeof v !== "number") throw new VmError("Expected integer", ErrorCode.E405);
    return v | 0;
  }

  private currentFrame(): CallFrame {
    return this.frames[this.frames.length - 1];
  }

  private readU16(): number {
    const frame = this.currentFrame();
    const val = frame.chunk.readU16(frame.ip);
    frame.ip += 2;
    return val;
  }

  // ── Value operations ──────────────────────────────────────────────────────

  private numericOp(op: string): void {
    const b = this.pop(), a = this.pop();
    if (typeof a !== "number" || typeof b !== "number") {
      throw new VmError(`Operator '${op}' requires numbers`, ErrorCode.E405);
    }
    switch (op) {
      case "-": this.push(a - b); break;
      case "*": this.push(a * b); break;
    }
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
    // Array equality: structural
    if ((a as HkdArray).type === "array" && (b as HkdArray).type === "array") {
      const aa = (a as HkdArray).elements;
      const ba = (b as HkdArray).elements;
      if (aa.length !== ba.length) return false;
      return aa.every((v, i) => this.hkdEquals(v, ba[i]));
    }
    return a === b; // reference equality for objects and functions
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
      // Format integers without decimal point
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
      // Array methods
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

  // ── Built-in functions ────────────────────────────────────────────────────

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

    this.defineNative("input", 1, (_args) => {
      // In non-REPL mode, input is a no-op returning empty string
      // The REPL overrides this
      return "";
    });

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

    // Internal built-ins used by the compiler
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

    this.defineNative("__hkd_unwrap", 1, (args) => {
      const v = args[0];
      if (v && typeof v === "object" && (v as any).type === "object" && (v as HkdObject).fields.get("__type__") === "Future") {
        return (v as HkdObject).fields.get("value") ?? null;
      }
      return v;
    });

    this.defineNative("__hkd_resolve", 2, (args) => {
      const fut = args[0];
      const val = args[1] !== undefined ? args[1] : null;
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        obj.fields.set("state", "resolved");
        obj.fields.set("value", val);
        const cbs = this.futureCallbacks.get(obj);
        if (cbs) {
          this.futureCallbacks.delete(obj);
          for (const cb of cbs) {
            this.runCallable(cb, [val]);
          }
        }
      }
      return fut;
    });

    this.defineNative("__hkd_reject", 2, (args) => {
      const fut = args[0];
      const err = args[1] !== undefined ? args[1] : null;
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        obj.fields.set("state", "rejected");
        obj.fields.set("error", err);
      }
      return fut;
    });

    this.defineNative("__hkd_on_complete", 2, (args) => {
      const fut = args[0];
      const cb = args[1];
      if (fut && typeof fut === "object" && (fut as any).type === "object") {
        const obj = fut as HkdObject;
        if (obj.fields.get("state") === "resolved") {
          this.runCallable(cb, [obj.fields.get("value") ?? null]);
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

// ─── VM Error ─────────────────────────────────────────────────────────────────

export class VmError extends Error {
  constructor(message: string, public readonly code: ErrorCode) {
    super(message);
    this.name = "VmError";
  }
}
