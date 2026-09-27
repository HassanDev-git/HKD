/**
 * HKD Mid-Level Intermediate Representation (MIR)
 *
 * SSA-ready Control Flow Graph (CFG) of BasicBlocks containing 3-address
 * virtual register instructions with PHI nodes, explicit edges, dominance
 * analysis, and IR validation passes. Serves as the foundation for
 * Phase 10 JIT / AOT native machine-code compilation.
 */
import { HIRProgram } from "./hir.js";
export type VReg = number;
export type MIRType = "i64" | "f64" | "bool" | "string" | "object" | "array" | "any";
export type MIROperand = {
    kind: "Reg";
    reg: VReg;
    type?: MIRType;
} | {
    kind: "Const";
    value: number | string | boolean | null;
    type?: MIRType;
};
export interface PhiIncoming {
    blockId: number;
    operand: MIROperand;
}
export type MIRInstr = {
    kind: "Const";
    dst: VReg;
    value: number | string | boolean | null;
    type?: MIRType;
} | {
    kind: "Copy";
    dst: VReg;
    src: MIROperand;
    type?: MIRType;
} | {
    kind: "BinOp";
    dst: VReg;
    op: string;
    left: MIROperand;
    right: MIROperand;
    type?: MIRType;
} | {
    kind: "UnaryOp";
    dst: VReg;
    op: string;
    operand: MIROperand;
    type?: MIRType;
} | {
    kind: "LoadLocal";
    dst: VReg;
    slot: number;
    type?: MIRType;
} | {
    kind: "StoreLocal";
    slot: number;
    src: MIROperand;
} | {
    kind: "LoadGlobal";
    dst: VReg;
    name: string;
    type?: MIRType;
} | {
    kind: "StoreGlobal";
    name: string;
    src: MIROperand;
} | {
    kind: "Call";
    dst: VReg;
    callee: MIROperand;
    args: MIROperand[];
    type?: MIRType;
} | {
    kind: "GetField";
    dst: VReg;
    target: MIROperand;
    field: string;
    type?: MIRType;
} | {
    kind: "SetField";
    target: MIROperand;
    field: string;
    value: MIROperand;
} | {
    kind: "AllocObject";
    dst: VReg;
    fields: {
        name: string;
        val: MIROperand;
    }[];
    type?: MIRType;
} | {
    kind: "AllocArray";
    dst: VReg;
    elements: MIROperand[];
    type?: MIRType;
} | {
    kind: "Phi";
    dst: VReg;
    incoming: PhiIncoming[];
    type?: MIRType;
};
export type MIRTerminator = {
    kind: "Branch";
    target: number;
} | {
    kind: "CondBranch";
    cond: MIROperand;
    thenTarget: number;
    elseTarget: number;
} | {
    kind: "Return";
    value?: MIROperand;
};
export interface BasicBlock {
    id: number;
    label: string;
    instructions: MIRInstr[];
    terminator?: MIRTerminator;
    predecessors: Set<number>;
    successors: Set<number>;
    parameters?: {
        vreg: VReg;
        type?: MIRType;
    }[];
}
export interface MIRFunction {
    name: string;
    arity: number;
    params: VReg[];
    paramTypes?: MIRType[];
    cfg: ControlFlowGraph;
}
export declare class ControlFlowGraph {
    entryBlockId: number;
    blocks: Map<number, BasicBlock>;
    private nextBlockId;
    private nextVRegId;
    allocBlock(label: string): BasicBlock;
    allocVReg(): VReg;
    addEdge(fromId: number, toId: number): void;
    removeEdge(fromId: number, toId: number): void;
    /**
     * Computes dominator sets for each BasicBlock in the CFG using fixed-point iteration:
     * Dom(entry) = {entry}
     * Dom(n) = {n} U (intersection of Dom(p) for all p in predecessors(n))
     */
    computeDominance(): Map<number, Set<number>>;
    /**
     * Computes immediate dominator (idom) for each block in the CFG.
     */
    computeImmediateDominators(): Map<number, number | null>;
    /**
     * Computes dominance frontiers for each block in the CFG.
     */
    computeDominanceFrontiers(): Map<number, Set<number>>;
    /**
     * Extracts Use-Def information across all instructions in the CFG.
     */
    getUseDefChains(): {
        defs: Map<VReg, number>;
        uses: Map<VReg, Set<number>>;
    };
}
export declare class IRValidationError extends Error {
    constructor(message: string);
}
/**
 * Validates that the Control Flow Graph has valid edges, entry block, and block symmetry.
 */
export declare function validateCFG(cfg: ControlFlowGraph): void;
/**
 * Validates the Static Single Assignment (SSA) invariant:
 * Every VReg is defined at most once across the entire function.
 */
export declare function validateSSA(cfg: ControlFlowGraph): void;
/**
 * Validates that every used register has a prior definition.
 */
export declare function validateUses(cfg: ControlFlowGraph): void;
/**
 * Validates that every basic block ends with a valid terminator matching its CFG successors.
 */
export declare function validateTerminators(cfg: ControlFlowGraph): void;
/**
 * Runs the full validation suite on a ControlFlowGraph.
 */
export declare function validateMIR(cfg: ControlFlowGraph): void;
export declare class MIRLowerer {
    private cfg;
    private currentBlock;
    constructor();
    lower(hir: HIRProgram): ControlFlowGraph;
    private lowerStmt;
    private lowerExpr;
}
//# sourceMappingURL=mir.d.ts.map