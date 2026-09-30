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
import { Chunk, HkdValue, HkdClosure, Upvalue } from "../bytecode/chunk.js";
import { ErrorCode } from "../errors/index.js";
export interface GlobalCell {
    name: string;
    value: HkdValue;
}
interface CallFrame {
    closure: HkdClosure | null;
    chunk: Chunk;
    ip: number;
    base: number;
    openUpvalues: Upvalue[];
    cells: Array<GlobalCell | undefined>;
}
export type VmResult = {
    ok: true;
    value: HkdValue;
} | {
    ok: false;
    error: string;
    code: ErrorCode;
};
export interface VmDebugger {
    onBeforeInstruction?(vm: VM, frame: CallFrame, op: number, line: number): "pause" | "continue" | void;
}
export declare class VM {
    private stack;
    private frames;
    private globals;
    private globalCells;
    private output;
    private dbg;
    isPaused: boolean;
    private futureCallbacks;
    private callbackQueue;
    private isDispatchingCallbacks;
    dispatchCallback(cb: HkdValue, args: HkdValue[]): void;
    constructor(output?: (s: string) => void);
    setDebugger(dbg: VmDebugger | null): void;
    run(chunk: Chunk): VmResult;
    getGlobalCell(name: string): GlobalCell;
    /** Register a native function in the global scope. */
    defineNative(name: string, arity: number, fn: (args: HkdValue[]) => HkdValue): void;
    /** Read a global value. */
    getGlobal(name: string): HkdValue | undefined;
    /** Set a global value. */
    setGlobal(name: string, value: HkdValue): void;
    resume(): VmResult;
    runCallable(callee: HkdValue, args: HkdValue[]): HkdValue;
    getCallFrames(): Array<{
        name: string;
        line: number;
        frameIndex: number;
    }>;
    getFrameLocals(frameIndex: number): Array<{
        name: string;
        value: HkdValue;
    }>;
    getAllGlobals(): Array<{
        name: string;
        value: HkdValue;
    }>;
    private getConstant;
    private execute;
    private callValue;
    private pushFrame;
    private push;
    private pop;
    private peek;
    private popInt;
    private currentFrame;
    private readU16;
    private numericOp;
    private isTruthy;
    private hkdEquals;
    private compareValues;
    private hkdToString;
    private getIndex;
    private setIndex;
    private getField;
    private makeIterator;
    private registerBuiltins;
}
export declare class VmError extends Error {
    readonly code: ErrorCode;
    constructor(message: string, code: ErrorCode);
}
export {};
//# sourceMappingURL=vm.d.ts.map