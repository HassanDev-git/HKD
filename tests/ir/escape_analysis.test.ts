import { describe, test, expect } from "@jest/globals";
import { ControlFlowGraph, MIRFunction } from "../../src/ir/mir.js";
import { MIROptimizer } from "../../src/ir/optimizer.js";

describe("HKD Phase 11 — Escape Analysis, SROA, Inlining & Loop Optimization", () => {
  test("SROA eliminates non-escaping object allocations", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    cfg.entryBlockId = b0.id;

    // let obj = { x: 10, y: 20 };
    // let sum = obj.x + obj.y;
    // return sum;
    const objReg = cfg.allocVReg();
    const xVal = cfg.allocVReg();
    const yVal = cfg.allocVReg();
    const sumReg = cfg.allocVReg();

    b0.instructions.push({
      kind: "AllocObject",
      dst: objReg,
      fields: [
        { name: "x", val: { kind: "Const", value: 10 } },
        { name: "y", val: { kind: "Const", value: 20 } },
      ],
    });
    b0.instructions.push({
      kind: "GetField",
      dst: xVal,
      target: { kind: "Reg", reg: objReg },
      field: "x",
    });
    b0.instructions.push({
      kind: "GetField",
      dst: yVal,
      target: { kind: "Reg", reg: objReg },
      field: "y",
    });
    b0.instructions.push({
      kind: "BinOp",
      dst: sumReg,
      op: "+",
      left: { kind: "Reg", reg: xVal },
      right: { kind: "Reg", reg: yVal },
    });
    b0.terminator = {
      kind: "Return",
      value: { kind: "Reg", reg: sumReg },
    };

    const optimizer = new MIROptimizer();
    optimizer.optimize(cfg);

    // Verify AllocObject was eliminated and scalar replacement took place
    expect(optimizer.stats.scalarReplacements).toBeGreaterThan(0);
    const hasAllocObject = b0.instructions.some(i => i.kind === "AllocObject");
    expect(hasAllocObject).toBe(false);
  });

  test("Escape analysis retains object when it escapes via return", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    cfg.entryBlockId = b0.id;

    const objReg = cfg.allocVReg();
    b0.instructions.push({
      kind: "AllocObject",
      dst: objReg,
      fields: [{ name: "id", val: { kind: "Const", value: 99 } }],
    });
    b0.terminator = {
      kind: "Return",
      value: { kind: "Reg", reg: objReg },
    };

    const optimizer = new MIROptimizer();
    optimizer.optimize(cfg);

    expect(optimizer.stats.scalarReplacements).toBe(0);
    const hasAlloc = b0.instructions.some(i => i.kind === "AllocObject");
    expect(hasAlloc).toBe(true);
  });

  test("Loop optimization hoists loop-invariant computations to pre-header", () => {
    const cfg = new ControlFlowGraph();
    const preHeader = cfg.allocBlock("pre_header");
    const loopHeader = cfg.allocBlock("loop_header");
    const loopBody = cfg.allocBlock("loop_body");
    const exitBlock = cfg.allocBlock("exit");

    cfg.entryBlockId = preHeader.id;
    cfg.addEdge(preHeader.id, loopHeader.id);
    preHeader.terminator = { kind: "Branch", target: loopHeader.id };

    const condReg = cfg.allocVReg();
    cfg.addEdge(loopHeader.id, loopBody.id);
    cfg.addEdge(loopHeader.id, exitBlock.id);
    loopHeader.terminator = {
      kind: "CondBranch",
      cond: { kind: "Reg", reg: condReg },
      thenTarget: loopBody.id,
      elseTarget: exitBlock.id,
    };

    // In loopBody: compute invariant invariantVal = 100 * 42
    const invReg = cfg.allocVReg();
    loopBody.instructions.push({
      kind: "BinOp",
      dst: invReg,
      op: "*",
      left: { kind: "Const", value: 100 },
      right: { kind: "Const", value: 42 },
    });

    cfg.addEdge(loopBody.id, loopHeader.id);
    loopBody.terminator = { kind: "Branch", target: loopHeader.id };
    exitBlock.terminator = { kind: "Return" };

    const optimizer = new MIROptimizer();
    optimizer.runLoopOptimizations(cfg);

    expect(optimizer.stats.hoistedLoopInvariants).toBeGreaterThan(0);
    // Invariant instruction should now be in preHeader
    const hoisted = preHeader.instructions.some(i => i.kind === "BinOp" && i.dst === invReg);
    expect(hoisted).toBe(true);
  });

  test("Controlled function inlining inlines small leaf functions", () => {
    const functions = new Map<string, MIRFunction>();

    // targetFn: fn square(x) { return x * x; }
    const targetCfg = new ControlFlowGraph();
    const tb = targetCfg.allocBlock("entry");
    targetCfg.entryBlockId = tb.id;
    const p0 = targetCfg.allocVReg();
    const res = targetCfg.allocVReg();
    tb.instructions.push({
      kind: "BinOp",
      dst: res,
      op: "*",
      left: { kind: "Reg", reg: p0 },
      right: { kind: "Reg", reg: p0 },
    });
    tb.terminator = { kind: "Return", value: { kind: "Reg", reg: res } };

    const targetFn: MIRFunction = {
      name: "square",
      arity: 1,
      params: [p0],
      cfg: targetCfg,
    };
    functions.set("square", targetFn);

    // callerFn: fn main() { let s = square(5); return s; }
    const callerCfg = new ControlFlowGraph();
    const cb = callerCfg.allocBlock("entry");
    callerCfg.entryBlockId = cb.id;
    const callDst = callerCfg.allocVReg();
    cb.instructions.push({
      kind: "Call",
      dst: callDst,
      callee: { kind: "Const", value: "square" },
      args: [{ kind: "Const", value: 5 }],
    });
    cb.terminator = { kind: "Return", value: { kind: "Reg", reg: callDst } };

    const callerFn: MIRFunction = {
      name: "main",
      arity: 0,
      params: [],
      cfg: callerCfg,
    };
    functions.set("main", callerFn);

    const optimizer = new MIROptimizer();
    const changed = optimizer.runFunctionInlining(functions);

    expect(changed).toBe(true);
    expect(optimizer.stats.inlinedCalls).toBe(1);
    const hasCall = cb.instructions.some(i => i.kind === "Call");
    expect(hasCall).toBe(false);
  });
});
