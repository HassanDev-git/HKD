/**
 * HKD Stack-to-Register Bytecode Lowering Engine
 *
 * Deterministically lowers Stack-based bytecode chunks to 3-address
 * virtual register chunks for execution on the Register VM.
 */
import { Chunk } from "./chunk.js";
import { RegisterChunk } from "./register_chunk.js";
import { OptimizerPipeline } from "./optimizer.js";
export declare function lowerToRegisterChunk(chunk: Chunk, optPipeline?: OptimizerPipeline): RegisterChunk;
//# sourceMappingURL=register_lowering.d.ts.map