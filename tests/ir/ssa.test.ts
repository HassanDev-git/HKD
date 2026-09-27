import {
  ControlFlowGraph,
  validateCFG,
  validateSSA,
  validateUses,
  validateTerminators,
  validateMIR,
  IRValidationError,
} from "../../src/ir/mir.js";

describe("HKD SSA-Ready MIR and Validation Suite", () => {
  it("should validate a well-formed CFG", () => {
    const cfg = new ControlFlowGraph();
    const entry = cfg.allocBlock("entry");
    cfg.entryBlockId = entry.id;

    const r0 = cfg.allocVReg();
    const r1 = cfg.allocVReg();
    entry.instructions.push({ kind: "Const", dst: r0, value: 42 });
    entry.instructions.push({ kind: "Copy", dst: r1, src: { kind: "Reg", reg: r0 } });
    entry.terminator = { kind: "Return", value: { kind: "Reg", reg: r1 } };

    expect(() => validateMIR(cfg)).not.toThrow();
  });

  it("should detect edge asymmetry in CFG", () => {
    const cfg = new ControlFlowGraph();
    const entry = cfg.allocBlock("entry");
    const target = cfg.allocBlock("target");
    cfg.entryBlockId = entry.id;

    // Asymmetric: entry has target as successor, but target lacks entry as predecessor
    entry.successors.add(target.id);
    entry.terminator = { kind: "Branch", target: target.id };
    target.terminator = { kind: "Return" };

    expect(() => validateCFG(cfg)).toThrow(IRValidationError);
  });

  it("should detect SSA violations (multiple definitions of the same register)", () => {
    const cfg = new ControlFlowGraph();
    const entry = cfg.allocBlock("entry");
    cfg.entryBlockId = entry.id;

    const r0 = cfg.allocVReg();
    entry.instructions.push({ kind: "Const", dst: r0, value: 10 });
    // Duplicate assignment to r0
    entry.instructions.push({ kind: "Const", dst: r0, value: 20 });
    entry.terminator = { kind: "Return" };

    expect(() => validateSSA(cfg)).toThrow(IRValidationError);
  });

  it("should detect use of undefined virtual registers", () => {
    const cfg = new ControlFlowGraph();
    const entry = cfg.allocBlock("entry");
    cfg.entryBlockId = entry.id;

    const r999 = 999; // Never defined
    const r0 = cfg.allocVReg();
    entry.instructions.push({ kind: "Copy", dst: r0, src: { kind: "Reg", reg: r999 } });
    entry.terminator = { kind: "Return" };

    expect(() => validateUses(cfg)).toThrow(IRValidationError);
  });

  it("should detect missing or malformed block terminators", () => {
    const cfg = new ControlFlowGraph();
    const entry = cfg.allocBlock("entry");
    cfg.entryBlockId = entry.id;
    // Missing terminator

    expect(() => validateTerminators(cfg)).toThrow(IRValidationError);
  });

  it("should correctly compute dominance for linear and diamond CFGs", () => {
    // Diamond CFG:
    //      Entry (0)
    //      /       \
    //   Then (1)  Else (2)
    //      \       /
    //      Merge (3)
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    const b1 = cfg.allocBlock("then");
    const b2 = cfg.allocBlock("else");
    const b3 = cfg.allocBlock("merge");
    cfg.entryBlockId = b0.id;

    cfg.addEdge(b0.id, b1.id);
    cfg.addEdge(b0.id, b2.id);
    cfg.addEdge(b1.id, b3.id);
    cfg.addEdge(b2.id, b3.id);

    b0.terminator = { kind: "CondBranch", cond: { kind: "Const", value: true }, thenTarget: b1.id, elseTarget: b2.id };
    b1.terminator = { kind: "Branch", target: b3.id };
    b2.terminator = { kind: "Branch", target: b3.id };
    b3.terminator = { kind: "Return" };

    const dom = cfg.computeDominance();

    // Entry dominates itself
    expect(dom.get(b0.id)).toEqual(new Set([b0.id]));
    // Then is dominated by {b0, b1}
    expect(dom.get(b1.id)).toEqual(new Set([b0.id, b1.id]));
    // Else is dominated by {b0, b2}
    expect(dom.get(b2.id)).toEqual(new Set([b0.id, b2.id]));
    // Merge is dominated by {b0, b3} (common ancestor)
    expect(dom.get(b3.id)).toEqual(new Set([b0.id, b3.id]));

    const idom = cfg.computeImmediateDominators();
    expect(idom.get(b0.id)).toBeNull();
    expect(idom.get(b1.id)).toBe(b0.id);
    expect(idom.get(b2.id)).toBe(b0.id);
    expect(idom.get(b3.id)).toBe(b0.id);
  });

  it("should validate well-formed PHI nodes", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    const b1 = cfg.allocBlock("then");
    const b2 = cfg.allocBlock("else");
    const b3 = cfg.allocBlock("merge");
    cfg.entryBlockId = b0.id;

    cfg.addEdge(b0.id, b1.id);
    cfg.addEdge(b0.id, b2.id);
    cfg.addEdge(b1.id, b3.id);
    cfg.addEdge(b2.id, b3.id);

    const r1 = cfg.allocVReg();
    const r2 = cfg.allocVReg();
    const rPhi = cfg.allocVReg();

    b1.instructions.push({ kind: "Const", dst: r1, value: 100 });
    b2.instructions.push({ kind: "Const", dst: r2, value: 200 });

    b3.instructions.push({
      kind: "Phi",
      dst: rPhi,
      incoming: [
        { blockId: b1.id, operand: { kind: "Reg", reg: r1 } },
        { blockId: b2.id, operand: { kind: "Reg", reg: r2 } },
      ],
    });

    b0.terminator = { kind: "CondBranch", cond: { kind: "Const", value: true }, thenTarget: b1.id, elseTarget: b2.id };
    b1.terminator = { kind: "Branch", target: b3.id };
    b2.terminator = { kind: "Branch", target: b3.id };
    b3.terminator = { kind: "Return", value: { kind: "Reg", reg: rPhi } };

    expect(() => validateMIR(cfg)).not.toThrow();
  });
});
