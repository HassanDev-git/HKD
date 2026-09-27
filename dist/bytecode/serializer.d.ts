import { Buffer } from "buffer";
import { Chunk } from "./chunk.js";
export declare function serialize(chunk: Chunk): Buffer;
export declare function serializeProgram(chunk: Chunk): Buffer;
export declare function deserializeProgram(buffer: Buffer): Chunk;
//# sourceMappingURL=serializer.d.ts.map