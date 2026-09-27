/**
 * HKD Mid-Level Intermediate Representation (MIR)
 * 
 * SSA-ready Control Flow Graph (CFG) of BasicBlocks containing 3-address
 * virtual register instructions with PHI nodes, explicit edges, dominance
 * analysis, and IR validation passes. Serves as the foundation for
 * Phase 10 JIT / AOT native machine-code compilation.
 */

import { HIRExpr, HIRProgram, HIRStmt } from "./hir.js";

export type VReg = number;

export type MIRType = "i64" | "f64" | "bool" | "string" | "object" | "array" | "any";

export type MIROperand =
  | { kind: "Reg"; reg: VReg; type?: MIRType }
  | { kind: "Const"; value: number | string | boolean | null; type?: MIRType };

export interface PhiIncoming {
  blockId: number;
  operand: MIROperand;
}

export type MIRInstr =
  | { kind: "Const"; dst: VReg; value: number | string | boolean | null; type?: MIRType }
  | { kind: "Copy"; dst: VReg; src: MIROperand; type?: MIRType }
  | { kind: "BinOp"; dst: VReg; op: string; left: MIROperand; right: MIROperand; type?: MIRType }
  | { kind: "UnaryOp"; dst: VReg; op: string; operand: MIROperand; type?: MIRType }
  | { kind: "LoadLocal"; dst: VReg; slot: number; type?: MIRType }
  | { kind: "StoreLocal"; slot: number; src: MIROperand }
  | { kind: "LoadGlobal"; dst: VReg; name: string; type?: MIRType }
  | { kind: "StoreGlobal"; name: string; src: MIROperand }
  | { kind: "Call"; dst: VReg; callee: MIROperand; args: MIROperand[]; type?: MIRType }
  | { kind: "GetField"; dst: VReg; target: MIROperand; field: string; type?: MIRType }
  | { kind: "SetField"; target: MIROperand; field: string; value: MIROperand }
  | { kind: "AllocObject"; dst: VReg; fields: { name: string; val: MIROperand }[]; type?: MIRType }
  | { kind: "AllocArray"; dst: VReg; elements: MIROperand[]; type?: MIRType }
  | { kind: "Phi"; dst: VReg; incoming: PhiIncoming[]; type?: MIRType };

export type MIRTerminator =
  | { kind: "Branch"; target: number }
  | { kind: "CondBranch"; cond: MIROperand; thenTarget: number; elseTarget: number }
  | { kind: "Return"; value?: MIROperand };

export interface BasicBlock {
  id: number;
  label: string;
  instructions: MIRInstr[];
  terminator?: MIRTerminator;
  predecessors: Set<number>;
  successors: Set<number>;
  parameters?: { vreg: VReg; type?: MIRType }[];
}

export interface MIRFunction {
  name: string;
  arity: number;
  params: VReg[];
  paramTypes?: MIRType[];
  cfg: ControlFlowGraph;
}

export class ControlFlowGraph {
  public entryBlockId: number = 0;
  public blocks: Map<number, BasicBlock> = new Map();
  private nextBlockId: number = 0;
  private nextVRegId: number = 0;

  public allocBlock(label: string): BasicBlock {
    const id = this.nextBlockId++;
    const block: BasicBlock = {
      id,
      label: `${label}_${id}`,
      instructions: [],
      predecessors: new Set(),
      successors: new Set(),
    };
    this.blocks.set(id, block);
    return block;
  }

  public allocVReg(): VReg {
    return this.nextVRegId++;
  }

  public addEdge(fromId: number, toId: number): void {
    const from = this.blocks.get(fromId);
    const to = this.blocks.get(toId);
    if (from && to) {
      from.successors.add(toId);
      to.predecessors.add(fromId);
    }
  }

  public removeEdge(fromId: number, toId: number): void {
    const from = this.blocks.get(fromId);
    const to = this.blocks.get(toId);
    if (from && to) {
      from.successors.delete(toId);
      to.predecessors.delete(fromId);
    }
  }

  /**
   * Computes dominator sets for each BasicBlock in the CFG using fixed-point iteration:
   * Dom(entry) = {entry}
   * Dom(n) = {n} U (intersection of Dom(p) for all p in predecessors(n))
   */
  public computeDominance(): Map<number, Set<number>> {
    const dom = new Map<number, Set<number>>();
    const allBlockIds = Array.from(this.blocks.keys());

    for (const bId of allBlockIds) {
      if (bId === this.entryBlockId) {
        dom.set(bId, new Set([bId]));
      } else {
        dom.set(bId, new Set(allBlockIds));
      }
    }

    let changed = true;
    while (changed) {
      changed = false;
      for (const bId of allBlockIds) {
        if (bId === this.entryBlockId) continue;
        const block = this.blocks.get(bId)!;
        if (block.predecessors.size === 0) continue;

        let intersection: Set<number> | null = null;
        for (const predId of block.predecessors) {
          const predDom = dom.get(predId);
          if (!predDom) continue;
          if (intersection === null) {
            intersection = new Set(predDom);
          } else {
            for (const id of Array.from(intersection)) {
              if (!predDom.has(id)) {
                intersection.delete(id);
              }
            }
          }
        }

        const newDom = new Set<number>([bId, ...(intersection ? Array.from(intersection) : [])]);
        const currentDom = dom.get(bId)!;
        if (newDom.size !== currentDom.size) {
          dom.set(bId, newDom);
          changed = true;
        } else {
          for (const elem of newDom) {
            if (!currentDom.has(elem)) {
              dom.set(bId, newDom);
              changed = true;
              break;
            }
          }
        }
      }
    }

    return dom;
  }

  /**
   * Computes immediate dominator (idom) for each block in the CFG.
   */
  public computeImmediateDominators(): Map<number, number | null> {
    const dom = this.computeDominance();
    const idom = new Map<number, number | null>();

    for (const [bId, domSet] of dom.entries()) {
      if (bId === this.entryBlockId) {
        idom.set(bId, null);
        continue;
      }
      // Strictly dominating nodes: Dom(bId) \ {bId}
      const strict = new Set<number>();
      for (const d of domSet) {
        if (d !== bId) strict.add(d);
      }

      // idom is the node in strict that does not strictly dominate any other node in strict
      let immediate: number | null = null;
      for (const candidate of strict) {
        let isImmediate = true;
        for (const other of strict) {
          if (candidate === other) continue;
          const otherDom = dom.get(other);
          if (otherDom && otherDom.has(candidate)) {
            isImmediate = false;
            break;
          }
        }
        if (isImmediate) {
          immediate = candidate;
          break;
        }
      }
      idom.set(bId, immediate);
    }

    return idom;
  }

  /**
   * Computes dominance frontiers for each block in the CFG.
   */
  public computeDominanceFrontiers(): Map<number, Set<number>> {
    const df = new Map<number, Set<number>>();
    for (const bId of this.blocks.keys()) {
      df.set(bId, new Set());
    }

    const idom = this.computeImmediateDominators();

    for (const [bId, block] of this.blocks.entries()) {
      if (block.predecessors.size >= 2) {
        for (const predId of block.predecessors) {
          let runner: number | null = predId;
          const bIdom = idom.get(bId);
          while (runner !== null && runner !== bIdom) {
            df.get(runner)?.add(bId);
            runner = idom.get(runner) ?? null;
          }
        }
      }
    }

    return df;
  }

  /**
   * Extracts Use-Def information across all instructions in the CFG.
   */
  public getUseDefChains(): { defs: Map<VReg, number>; uses: Map<VReg, Set<number>> } {
    const defs = new Map<VReg, number>();
    const uses = new Map<VReg, Set<number>>();

    for (const [blockId, block] of this.blocks.entries()) {
      for (const instr of block.instructions) {
        if ("dst" in instr) {
          defs.set(instr.dst, blockId);
        }

        // Collect uses
        const usedRegs: VReg[] = [];
        if (instr.kind === "Copy" && instr.src.kind === "Reg") usedRegs.push(instr.src.reg);
        if (instr.kind === "BinOp") {
          if (instr.left.kind === "Reg") usedRegs.push(instr.left.reg);
          if (instr.right.kind === "Reg") usedRegs.push(instr.right.reg);
        }
        if (instr.kind === "UnaryOp" && instr.operand.kind === "Reg") usedRegs.push(instr.operand.reg);
        if (instr.kind === "StoreLocal" && instr.src.kind === "Reg") usedRegs.push(instr.src.reg);
        if (instr.kind === "StoreGlobal" && instr.src.kind === "Reg") usedRegs.push(instr.src.reg);
        if (instr.kind === "Call") {
          if (instr.callee.kind === "Reg") usedRegs.push(instr.callee.reg);
          for (const a of instr.args) if (a.kind === "Reg") usedRegs.push(a.reg);
        }
        if (instr.kind === "GetField" && instr.target.kind === "Reg") usedRegs.push(instr.target.reg);
        if (instr.kind === "SetField") {
          if (instr.target.kind === "Reg") usedRegs.push(instr.target.reg);
          if (instr.value.kind === "Reg") usedRegs.push(instr.value.reg);
        }
        if (instr.kind === "Phi") {
          for (const inc of instr.incoming) {
            if (inc.operand.kind === "Reg") usedRegs.push(inc.operand.reg);
          }
        }

        for (const reg of usedRegs) {
          if (!uses.has(reg)) uses.set(reg, new Set());
          uses.get(reg)!.add(blockId);
        }
      }

      if (block.terminator) {
        if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg") {
          const reg = block.terminator.cond.reg;
          if (!uses.has(reg)) uses.set(reg, new Set());
          uses.get(reg)!.add(blockId);
        }
        if (block.terminator.kind === "Return" && block.terminator.value?.kind === "Reg") {
          const reg = block.terminator.value.reg;
          if (!uses.has(reg)) uses.set(reg, new Set());
          uses.get(reg)!.add(blockId);
        }
      }
    }

    return { defs, uses };
  }
}

// ─── IR Validation Passes ───────────────────────────────────────────────────

export class IRValidationError extends Error {
  constructor(message: string) {
    super(`[IRValidationError] ${message}`);
    this.name = "IRValidationError";
  }
}

/**
 * Validates that the Control Flow Graph has valid edges, entry block, and block symmetry.
 */
export function validateCFG(cfg: ControlFlowGraph): void {
  if (!cfg.blocks.has(cfg.entryBlockId)) {
    throw new IRValidationError(`Entry block with ID ${cfg.entryBlockId} does not exist in CFG.`);
  }

  for (const [bId, block] of cfg.blocks.entries()) {
    // Check successors
    for (const succId of block.successors) {
      const succ = cfg.blocks.get(succId);
      if (!succ) {
        throw new IRValidationError(`Block ${bId} references non-existent successor block ${succId}.`);
      }
      if (!succ.predecessors.has(bId)) {
        throw new IRValidationError(`Edge asymmetry: Block ${bId} has successor ${succId}, but ${succId} does not list ${bId} as predecessor.`);
      }
    }

    // Check predecessors
    for (const predId of block.predecessors) {
      const pred = cfg.blocks.get(predId);
      if (!pred) {
        throw new IRValidationError(`Block ${bId} references non-existent predecessor block ${predId}.`);
      }
      if (!pred.successors.has(bId)) {
        throw new IRValidationError(`Edge asymmetry: Block ${bId} has predecessor ${predId}, but ${predId} does not list ${bId} as successor.`);
      }
    }
  }
}

/**
 * Validates the Static Single Assignment (SSA) invariant:
 * Every VReg is defined at most once across the entire function.
 */
export function validateSSA(cfg: ControlFlowGraph): void {
  const definedRegs = new Set<VReg>();

  for (const [bId, block] of cfg.blocks.entries()) {
    for (const instr of block.instructions) {
      if ("dst" in instr) {
        if (definedRegs.has(instr.dst)) {
          throw new IRValidationError(`SSA Violation: Virtual register %${instr.dst} is defined multiple times (duplicate in block ${bId}).`);
        }
        definedRegs.add(instr.dst);
      }
    }
  }
}

/**
 * Validates that every used register has a prior definition.
 */
export function validateUses(cfg: ControlFlowGraph): void {
  const definedRegs = new Set<VReg>();

  // Collect all definitions first
  for (const block of cfg.blocks.values()) {
    for (const instr of block.instructions) {
      if ("dst" in instr) {
        definedRegs.add(instr.dst);
      }
    }
    if (block.parameters) {
      for (const param of block.parameters) {
        definedRegs.add(param.vreg);
      }
    }
  }

  // Verify all uses
  for (const [bId, block] of cfg.blocks.entries()) {
    for (const instr of block.instructions) {
      const checkOp = (op: MIROperand) => {
        if (op.kind === "Reg" && !definedRegs.has(op.reg)) {
          throw new IRValidationError(`Undefined register use: %${op.reg} in block ${bId} (${instr.kind}).`);
        }
      };

      if (instr.kind === "Copy") checkOp(instr.src);
      if (instr.kind === "BinOp") { checkOp(instr.left); checkOp(instr.right); }
      if (instr.kind === "UnaryOp") checkOp(instr.operand);
      if (instr.kind === "StoreLocal") checkOp(instr.src);
      if (instr.kind === "StoreGlobal") checkOp(instr.src);
      if (instr.kind === "Call") {
        checkOp(instr.callee);
        for (const a of instr.args) checkOp(a);
      }
      if (instr.kind === "GetField") checkOp(instr.target);
      if (instr.kind === "SetField") { checkOp(instr.target); checkOp(instr.value); }
      if (instr.kind === "AllocObject") {
        for (const f of instr.fields) checkOp(f.val);
      }
      if (instr.kind === "AllocArray") {
        for (const el of instr.elements) checkOp(el);
      }
      if (instr.kind === "Phi") {
        for (const inc of instr.incoming) {
          checkOp(inc.operand);
          if (!block.predecessors.has(inc.blockId)) {
            throw new IRValidationError(`Phi in block ${bId} references non-predecessor incoming block ${inc.blockId}.`);
          }
        }
      }
    }

    if (block.terminator) {
      if (block.terminator.kind === "CondBranch" && block.terminator.cond.kind === "Reg") {
        if (!definedRegs.has(block.terminator.cond.reg)) {
          throw new IRValidationError(`Undefined register use in CondBranch: %${block.terminator.cond.reg} in block ${bId}.`);
        }
      }
      if (block.terminator.kind === "Return" && block.terminator.value?.kind === "Reg") {
        if (!definedRegs.has(block.terminator.value.reg)) {
          throw new IRValidationError(`Undefined register use in Return: %${block.terminator.value.reg} in block ${bId}.`);
        }
      }
    }
  }
}

/**
 * Validates that every basic block ends with a valid terminator matching its CFG successors.
 */
export function validateTerminators(cfg: ControlFlowGraph): void {
  for (const [bId, block] of cfg.blocks.entries()) {
    if (!block.terminator) {
      throw new IRValidationError(`Block ${bId} (${block.label}) has no terminator instruction.`);
    }

    switch (block.terminator.kind) {
      case "Branch": {
        if (!block.successors.has(block.terminator.target)) {
          throw new IRValidationError(`Block ${bId} terminator branches to ${block.terminator.target}, but it is not in successors.`);
        }
        if (block.successors.size !== 1) {
          throw new IRValidationError(`Block ${bId} with Branch terminator has ${block.successors.size} successors (expected 1).`);
        }
        break;
      }
      case "CondBranch": {
        if (!block.successors.has(block.terminator.thenTarget) || !block.successors.has(block.terminator.elseTarget)) {
          throw new IRValidationError(`Block ${bId} CondBranch targets do not match successors.`);
        }
        break;
      }
      case "Return": {
        if (block.successors.size !== 0) {
          throw new IRValidationError(`Block ${bId} with Return terminator must have 0 successors, found ${block.successors.size}.`);
        }
        break;
      }
    }
  }
}

/**
 * Runs the full validation suite on a ControlFlowGraph.
 */
export function validateMIR(cfg: ControlFlowGraph): void {
  validateCFG(cfg);
  validateTerminators(cfg);
  validateSSA(cfg);
  validateUses(cfg);
}

// ─── MIR Lowerer ────────────────────────────────────────────────────────────

export class MIRLowerer {
  private cfg = new ControlFlowGraph();
  private currentBlock: BasicBlock;

  constructor() {
    this.currentBlock = this.cfg.allocBlock("entry");
    this.cfg.entryBlockId = this.currentBlock.id;
  }

  public lower(hir: HIRProgram): ControlFlowGraph {
    for (const stmt of hir.statements) {
      this.lowerStmt(stmt);
    }
    if (!this.currentBlock.terminator) {
      this.currentBlock.terminator = { kind: "Return" };
    }
    return this.cfg;
  }

  private lowerStmt(stmt: HIRStmt): void {
    switch (stmt.kind) {
      case "Let": {
        const val = this.lowerExpr(stmt.init);
        this.currentBlock.instructions.push({
          kind: "StoreLocal",
          slot: stmt.slot,
          src: val,
        });
        break;
      }
      case "Expr":
        this.lowerExpr(stmt.expr);
        break;
      case "Assign": {
        const val = this.lowerExpr(stmt.value);
        if (stmt.isGlobal) {
          this.currentBlock.instructions.push({ kind: "StoreGlobal", name: stmt.name, src: val });
        } else if (stmt.slot !== undefined) {
          this.currentBlock.instructions.push({ kind: "StoreLocal", slot: stmt.slot, src: val });
        }
        break;
      }
      case "If": {
        const cond = this.lowerExpr(stmt.condition);
        const thenBlock = this.cfg.allocBlock("then");
        const elseBlock = stmt.elseBranch ? this.cfg.allocBlock("else") : null;
        const mergeBlock = this.cfg.allocBlock("merge");

        this.currentBlock.terminator = {
          kind: "CondBranch",
          cond,
          thenTarget: thenBlock.id,
          elseTarget: elseBlock ? elseBlock.id : mergeBlock.id,
        };
        this.cfg.addEdge(this.currentBlock.id, thenBlock.id);
        this.cfg.addEdge(this.currentBlock.id, elseBlock ? elseBlock.id : mergeBlock.id);

        // Emit then
        this.currentBlock = thenBlock;
        for (const s of stmt.thenBranch) this.lowerStmt(s);
        if (!this.currentBlock.terminator) {
          this.currentBlock.terminator = { kind: "Branch", target: mergeBlock.id };
          this.cfg.addEdge(this.currentBlock.id, mergeBlock.id);
        }

        // Emit else
        if (elseBlock && stmt.elseBranch) {
          this.currentBlock = elseBlock;
          for (const s of stmt.elseBranch) this.lowerStmt(s);
          if (!this.currentBlock.terminator) {
            this.currentBlock.terminator = { kind: "Branch", target: mergeBlock.id };
            this.cfg.addEdge(this.currentBlock.id, mergeBlock.id);
          }
        }

        this.currentBlock = mergeBlock;
        break;
      }
      case "While": {
        const loopCondBlock = this.cfg.allocBlock("loop_cond");
        const loopBodyBlock = this.cfg.allocBlock("loop_body");
        const loopExitBlock = this.cfg.allocBlock("loop_exit");

        this.currentBlock.terminator = { kind: "Branch", target: loopCondBlock.id };
        this.cfg.addEdge(this.currentBlock.id, loopCondBlock.id);

        // Condition
        this.currentBlock = loopCondBlock;
        const cond = this.lowerExpr(stmt.condition);
        this.currentBlock.terminator = {
          kind: "CondBranch",
          cond,
          thenTarget: loopBodyBlock.id,
          elseTarget: loopExitBlock.id,
        };
        this.cfg.addEdge(loopCondBlock.id, loopBodyBlock.id);
        this.cfg.addEdge(loopCondBlock.id, loopExitBlock.id);

        // Body
        this.currentBlock = loopBodyBlock;
        for (const s of stmt.body) this.lowerStmt(s);
        if (!this.currentBlock.terminator) {
          this.currentBlock.terminator = { kind: "Branch", target: loopCondBlock.id };
          this.cfg.addEdge(loopBodyBlock.id, loopCondBlock.id);
        }

        this.currentBlock = loopExitBlock;
        break;
      }
      case "Return": {
        const val = stmt.value ? this.lowerExpr(stmt.value) : undefined;
        this.currentBlock.terminator = { kind: "Return", value: val };
        break;
      }
      case "Block":
        for (const s of stmt.statements) this.lowerStmt(s);
        break;
      default:
        break;
    }
  }

  private lowerExpr(expr: HIRExpr): MIROperand {
    switch (expr.kind) {
      case "Literal":
        return { kind: "Const", value: expr.value };
      case "Variable": {
        const dst = this.cfg.allocVReg();
        if (expr.isGlobal) {
          this.currentBlock.instructions.push({ kind: "LoadGlobal", dst, name: expr.name });
        } else if (expr.slot !== undefined) {
          this.currentBlock.instructions.push({ kind: "LoadLocal", dst, slot: expr.slot });
        }
        return { kind: "Reg", reg: dst };
      }
      case "Binary": {
        const left = this.lowerExpr(expr.left);
        const right = this.lowerExpr(expr.right);
        const dst = this.cfg.allocVReg();
        this.currentBlock.instructions.push({
          kind: "BinOp",
          dst,
          op: expr.op,
          left,
          right,
        });
        return { kind: "Reg", reg: dst };
      }
      case "Unary": {
        const operand = this.lowerExpr(expr.operand);
        const dst = this.cfg.allocVReg();
        this.currentBlock.instructions.push({
          kind: "UnaryOp",
          dst,
          op: expr.op,
          operand,
        });
        return { kind: "Reg", reg: dst };
      }
      case "Call": {
        const callee = this.lowerExpr(expr.callee);
        const args = expr.args.map((a) => this.lowerExpr(a));
        const dst = this.cfg.allocVReg();
        this.currentBlock.instructions.push({
          kind: "Call",
          dst,
          callee,
          args,
        });
        return { kind: "Reg", reg: dst };
      }
      case "FieldAccess": {
        const target = this.lowerExpr(expr.target);
        const dst = this.cfg.allocVReg();
        this.currentBlock.instructions.push({
          kind: "GetField",
          dst,
          target,
          field: expr.field,
        });
        return { kind: "Reg", reg: dst };
      }
      default:
        return { kind: "Const", value: null };
    }
  }
}
