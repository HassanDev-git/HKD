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
import { Chunk, HkdValue } from "../bytecode/chunk.js";
import { RegisterChunk } from "../bytecode/register_chunk.js";
import { VmResult } from "./vm.js";
export interface GlobalCell {
    name: string;
    value: HkdValue;
}
export declare class RegisterVM {
    private frames;
    private globals;
    private globalCells;
    private output;
    private futureCallbacks;
    private callbackQueue;
    private isDispatchingCallbacks;
    private regArrayPool;
    constructor(output?: (s: string) => void);
    dispatchCallback(cb: HkdValue, args: HkdValue[]): void;
    runCallable(callee: HkdValue, args: HkdValue[]): HkdValue;
    getGlobalCell(name: string): GlobalCell;
    defineNative(name: string, arity: number, fn: (args: HkdValue[]) => HkdValue): void;
    getGlobal(name: string): HkdValue | undefined;
    setGlobal(name: string, value: HkdValue): void;
    getAllGlobals(): Array<{
        name: string;
        value: HkdValue;
    }>;
    run(chunk: Chunk | RegisterChunk): VmResult;
    private pushFrame;
    private execute;
    private toInt;
    private isTruthy;
    private hkdEquals;
    private compareValues;
    private hkdToString;
    private getIndex;
    private setIndex;
    private getArrayLen;
    private getField;
    private setField;
    private makeIterator;
    private registerBuiltins;
}
//# sourceMappingURL=vm_register.d.ts.map