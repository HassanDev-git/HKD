/**
 * HKD Optimizer Passes Implementation (Phase 9D)
 *
 * Provides:
 *   1. foldAstConstants: AST constant folding, propagation, and branch simplification
 *   2. optimizeBytecodeChunk: Bytecode jump threading and peephole optimization
 *   3. optimizeRegisterChunk: Register-level copy propagation and move elimination
 */
import * as N from "../ast/nodes.js";
import { Chunk } from "../bytecode/chunk.js";
import { RegisterChunk } from "../bytecode/register_chunk.js";
import { OptimizationStats, OptimizerOptions } from "./optimizer.js";
export declare function foldAstConstants(program: N.Program, stats: OptimizationStats, options: Required<OptimizerOptions>): N.Program;
export declare function optimizeBytecodeChunk(chunk: Chunk, stats: OptimizationStats, options: Required<OptimizerOptions>): Chunk;
export declare function optimizeRegisterChunk(regChunk: RegisterChunk, stats: OptimizationStats, options: Required<OptimizerOptions>): RegisterChunk;
//# sourceMappingURL=optimizer_passes.d.ts.map