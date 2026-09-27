/**
 * HKD Bytecode Chunk
 *
 * A Chunk holds:
 *  - A byte array of opcodes + operands
 *  - A constant pool (values referenced by index)
 *  - Line number mapping for debug info
 *  - Metadata (name, arity, local count)
 */
import { Op } from "./opcodes.js";
export type HkdValue = null | boolean | number | string | HkdArray | HkdObject | HkdFunction | HkdClosure | HkdNativeFunction | HkdIterator;
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
    arity: number;
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
    arity: number;
    call: (args: HkdValue[]) => HkdValue;
}
export interface HkdIterator {
    type: "iterator";
    next: () => IteratorResult<HkdValue>;
}
export interface Upvalue {
    value: HkdValue;
    closed: boolean;
    stackIndex: number;
}
export declare class Chunk {
    code: number[];
    constants: HkdValue[];
    lines: number[];
    name: string;
    arity: number;
    localCount: number;
    upvalueCount: number;
    private constantMap;
    constructor(name?: string, arity?: number);
    writeByte(byte: number, line?: number): number;
    writeU16(value: number, line?: number): void;
    /** Write a signed 16-bit offset (for jumps). */
    writeI16(value: number, line?: number): void;
    /** Add a constant to the pool and return its index. */
    addConstant(value: HkdValue): number;
    /** Emit LOAD_CONST for a value. */
    emitConstant(value: HkdValue, line?: number): void;
    /** Emit a jump instruction and return the offset of the placeholder. */
    emitJump(op: Op, line?: number): number;
    /** Patch a jump placeholder with the actual offset. */
    patchJump(jumpOffset: number): void;
    /** Emit a loop jump back to `loopStart`. */
    emitLoop(loopStart: number, line?: number): void;
    readByte(ip: number): number;
    readU16(ip: number): number;
    readI16(ip: number): number;
    disassemble(): string;
    disassembleInstruction(ip: number): [string, number];
}
export declare function formatValue(v: HkdValue): string;
//# sourceMappingURL=chunk.d.ts.map