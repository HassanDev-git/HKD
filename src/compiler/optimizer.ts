/**
 * HKD Compiler Optimization Pipeline (Phase 9D)
 *
 * Implements deterministic compiler optimization passes:
 *   1. AST Constant Folding & Propagation
 *   2. AST Branch & Loop Simplification
 *   3. Bytecode Jump Threading & Peephole Cleanup
 *   4. Register-Level Copy Propagation & Move Elimination
 */

import * as N from "../ast/nodes.js";
import { Chunk } from "../bytecode/chunk.js";
import { RegisterChunk } from "../bytecode/register_chunk.js";
import {
  foldAstConstants,
  optimizeBytecodeChunk,
  optimizeRegisterChunk,
} from "./optimizer_passes.js";

export interface OptimizationStats {
  constantsFolded: number;
  branchesSimplified: number;
  jumpsThreaded: number;
  deadInstructionsRemoved: number;
  movesEliminated: number;
  registerMovesRemoved: number;
}

export interface OptimizerOptions {
  enabled?: boolean;
  constantFolding?: boolean;
  deadCodeElimination?: boolean;
  jumpThreading?: boolean;
  peephole?: boolean;
  registerOptimization?: boolean;
}

export class OptimizerPipeline {
  private stats: OptimizationStats = {
    constantsFolded: 0,
    branchesSimplified: 0,
    jumpsThreaded: 0,
    deadInstructionsRemoved: 0,
    movesEliminated: 0,
    registerMovesRemoved: 0,
  };

  private options: Required<OptimizerOptions>;

  constructor(options: OptimizerOptions = {}) {
    this.options = {
      enabled: options.enabled !== undefined ? options.enabled : (process.env.HKD_OPT_ENABLED !== "0"),
      constantFolding: options.constantFolding !== undefined ? options.constantFolding : (process.env.HKD_OPT_CONST_FOLD !== "0"),
      deadCodeElimination: options.deadCodeElimination !== undefined ? options.deadCodeElimination : (process.env.HKD_OPT_DCE !== "0"),
      jumpThreading: options.jumpThreading !== undefined ? options.jumpThreading : (process.env.HKD_OPT_JUMP_THREAD !== "0"),
      peephole: options.peephole !== undefined ? options.peephole : (process.env.HKD_OPT_PEEPHOLE !== "0"),
      registerOptimization: options.registerOptimization !== undefined ? options.registerOptimization : (process.env.HKD_OPT_REG_OPT !== "0"),
    };
  }

  public getStats(): Readonly<OptimizationStats> {
    return { ...this.stats };
  }

  public resetStats(): void {
    this.stats = {
      constantsFolded: 0,
      branchesSimplified: 0,
      jumpsThreaded: 0,
      deadInstructionsRemoved: 0,
      movesEliminated: 0,
      registerMovesRemoved: 0,
    };
  }

  /**
   * Pass 1: Optimize AST before bytecode emission.
   */
  public optimizeAst(program: N.Program): N.Program {
    if (!this.options.enabled) return program;
    return foldAstConstants(program, this.stats, this.options);
  }

  /**
   * Pass 2: Optimize stack-based bytecode Chunk.
   */
  public optimizeChunk(chunk: Chunk): Chunk {
    if (!this.options.enabled) return chunk;
    return optimizeBytecodeChunk(chunk, this.stats, this.options);
  }

  /**
   * Pass 3: Optimize register-based bytecode RegisterChunk.
   */
  public optimizeRegister(regChunk: RegisterChunk): RegisterChunk {
    if (!this.options.enabled || !this.options.registerOptimization) return regChunk;
    return optimizeRegisterChunk(regChunk, this.stats, this.options);
  }
}
