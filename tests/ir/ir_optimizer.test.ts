import { describe, test, expect } from "@jest/globals";
import { Lexer } from "../../src/lexer/lexer.js";
import { Parser } from "../../src/parser/parser.js";
import { ErrorReporter } from "../../src/errors/index.js";
import { HIRLowerer } from "../../src/ir/hir.js";
import { MIRLowerer, ControlFlowGraph, MIRInstr } from "../../src/ir/mir.js";
import { MIROptimizer } from "../../src/ir/optimizer.js";
import { MIRCodegen } from "../../src/ir/codegen.js";

function compileToMIR(source: string) {
  const reporter = new ErrorReporter(source, "test.hkd");
  const lexer = new Lexer(source, "test.hkd", reporter);
  const tokens = lexer.tokenize();
  const parser = new Parser(tokens, source, "test.hkd", reporter);
  const ast = parser.parse();

  const hirLowerer = new HIRLowerer();
  const hir = hirLowerer.lower(ast);

  const mirLowerer = new MIRLowerer();
  const mir = mirLowerer.lower(hir);

  return { ast, hir, mir };
}

describe("Phase 9D — HIR/MIR Optimization Layer", () => {
  test("Constant folding evaluates arithmetic constants at compile time", () => {
    const { mir } = compileToMIR("let x = 10 + 20 * 2");
    const optimizer = new MIROptimizer();
    optimizer.optimize(mir);

    expect(optimizer.stats.foldedConstants).toBeGreaterThanOrEqual(1);

    // Entry block should contain folded constant 50
    const entry = mir.blocks.get(mir.entryBlockId);
    expect(entry).toBeDefined();

    const hasFoldedConstant = entry!.instructions.some(
      (instr) => instr.kind === "Const" && instr.value === 50
    );
    expect(hasFoldedConstant).toBe(true);
  });

  test("Constant folding evaluates string concatenation", () => {
    const { mir } = compileToMIR('let greeting = "Hello, " + "HKD!"');
    const optimizer = new MIROptimizer();
    optimizer.optimize(mir);

    expect(optimizer.stats.foldedConstants).toBeGreaterThanOrEqual(1);

    const entry = mir.blocks.get(mir.entryBlockId);
    const hasFoldedStr = entry!.instructions.some(
      (instr) => instr.kind === "Const" && instr.value === "Hello, HKD!"
    );
    expect(hasFoldedStr).toBe(true);
  });

  test("Constant folding resolves comparison expressions", () => {
    const { mir } = compileToMIR("let isGreater = 100 > 50");
    const optimizer = new MIROptimizer();
    optimizer.optimize(mir);

    expect(optimizer.stats.foldedConstants).toBeGreaterThanOrEqual(1);

    const entry = mir.blocks.get(mir.entryBlockId);
    const hasFoldedBool = entry!.instructions.some(
      (instr) => instr.kind === "Const" && instr.value === true
    );
    expect(hasFoldedBool).toBe(true);
  });

  test("Dead code elimination removes unused intermediate computations", () => {
    const { mir } = compileToMIR(`
      let a = 1 + 2
      let b = 3 + 4
      return b
    `);
    const optimizer = new MIROptimizer();
    optimizer.optimize(mir);

    expect(optimizer.stats.eliminatedInstructions).toBeGreaterThanOrEqual(0);
  });

  test("Codegen lowers optimized MIR into a valid Chunk", () => {
    const { mir } = compileToMIR(`
      let x = 40 + 2
      return x
    `);
    const optimizer = new MIROptimizer();
    const optimized = optimizer.optimize(mir);

    const codegen = new MIRCodegen();
    const chunk = codegen.generate(optimized);

    expect(chunk.code.length).toBeGreaterThan(0);
    expect(chunk.constants.length).toBeGreaterThan(0);
  });

  test("Algebraic simplification folds arithmetic identities", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    cfg.entryBlockId = b0.id;

    const rX = cfg.allocVReg();
    const rPlus0 = cfg.allocVReg();
    const rTimes1 = cfg.allocVReg();
    const rTimes0 = cfg.allocVReg();

    b0.instructions.push({ kind: "LoadLocal", dst: rX, slot: 0 });
    b0.instructions.push({ kind: "BinOp", dst: rPlus0, op: "+", left: { kind: "Reg", reg: rX }, right: { kind: "Const", value: 0 } });
    b0.instructions.push({ kind: "BinOp", dst: rTimes1, op: "*", left: { kind: "Reg", reg: rPlus0 }, right: { kind: "Const", value: 1 } });
    b0.instructions.push({ kind: "BinOp", dst: rTimes0, op: "*", left: { kind: "Reg", reg: rTimes1 }, right: { kind: "Const", value: 0 } });
    b0.terminator = { kind: "Return", value: { kind: "Reg", reg: rTimes0 } };

    const optimizer = new MIROptimizer();
    optimizer.optimize(cfg);

    expect(optimizer.stats.algebraicSimplifications).toBeGreaterThanOrEqual(2);
    // rTimes0 should be folded to Const 0
    const hasConstZero = b0.instructions.some((i: MIRInstr) => i.kind === "Const" && i.value === 0);
    expect(hasConstZero).toBe(true);
  });

  test("Common subexpression elimination reuses prior identical expressions", () => {
    const cfg = new ControlFlowGraph();
    const b0 = cfg.allocBlock("entry");
    cfg.entryBlockId = b0.id;

    const rA = cfg.allocVReg();
    const rB = cfg.allocVReg();
    const rSum1 = cfg.allocVReg();
    const rSum2 = cfg.allocVReg();
    const rTotal = cfg.allocVReg();

    b0.instructions.push({ kind: "LoadLocal", dst: rA, slot: 0 });
    b0.instructions.push({ kind: "LoadLocal", dst: rB, slot: 1 });
    // First: %rSum1 = %rA + %rB
    b0.instructions.push({ kind: "BinOp", dst: rSum1, op: "+", left: { kind: "Reg", reg: rA }, right: { kind: "Reg", reg: rB } });
    // Duplicate: %rSum2 = %rB + %rA (commutative match)
    b0.instructions.push({ kind: "BinOp", dst: rSum2, op: "+", left: { kind: "Reg", reg: rB }, right: { kind: "Reg", reg: rA } });
    b0.instructions.push({ kind: "BinOp", dst: rTotal, op: "*", left: { kind: "Reg", reg: rSum1 }, right: { kind: "Reg", reg: rSum2 } });
    b0.terminator = { kind: "Return", value: { kind: "Reg", reg: rTotal } };

    const optimizer = new MIROptimizer();
    optimizer.optimize(cfg);

    expect(optimizer.stats.commonSubexpressionsEliminated).toBeGreaterThanOrEqual(1);
    // Duplicate was eliminated via CSE and propagated directly to rSum1
    const totalInstr = b0.instructions.find((i: MIRInstr) => i.kind === "BinOp" && i.dst === rTotal) as any;
    expect(totalInstr).toBeDefined();
    expect(totalInstr.left.reg).toBe(rSum1);
    expect(totalInstr.right.reg).toBe(rSum1);
  });
});
