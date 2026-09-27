/**
 * HKD MIR to Bytecode Codegen
 *
 * Lowers an optimized Control Flow Graph (CFG) into a linear Chunk of HKDB bytecode.
 */
import { Chunk } from "../bytecode/chunk.js";
import { ControlFlowGraph } from "./mir.js";
export declare class MIRCodegen {
    private chunk;
    private regToStack;
    private blockOffsets;
    private jumpPatches;
    constructor(name?: string, arity?: number);
    generate(cfg: ControlFlowGraph): Chunk;
    private linearize;
    private emitInstr;
    private emitTerminator;
    private emitOperand;
    private emitStoreVReg;
    private emitLoadConst;
}
//# sourceMappingURL=codegen.d.ts.map