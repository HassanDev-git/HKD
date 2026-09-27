import { Buffer } from "buffer";
import { Chunk } from "./chunk.js";

export function serialize(chunk: Chunk): Buffer {
  const parts: Buffer[] = [];

  // Helper to append a single byte
  const writeByte = (b: number) => {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(b, 0);
    parts.push(buf);
  };

  // Helper to append a u16
  const writeU16 = (val: number) => {
    const buf = Buffer.alloc(2);
    buf.writeUInt16BE(val, 0);
    parts.push(buf);
  };

  // Helper to append a u32
  const writeU32 = (val: number) => {
    const buf = Buffer.alloc(4);
    buf.writeUInt32BE(val, 0);
    parts.push(buf);
  };

  // Helper to append a double (f64)
  const writeF64 = (val: number) => {
    const buf = Buffer.alloc(8);
    buf.writeDoubleBE(val, 0);
    parts.push(buf);
  };

  // Helper to append a string
  const writeString = (str: string) => {
    const strBuf = Buffer.from(str, "utf-8");
    writeU16(strBuf.length);
    parts.push(strBuf);
  };

  // 1. Serialize name
  writeString(chunk.name);

  // 2. Serialize arity
  writeByte(chunk.arity);

  // 3. Serialize localCount
  writeU16(chunk.localCount);

  // 4. Serialize upvalueCount
  writeU16(chunk.upvalueCount);

  // 5. Serialize code length & bytes
  writeU32(chunk.code.length);
  const codeBuf = Buffer.from(chunk.code);
  parts.push(codeBuf);

  // 6. Serialize lines length & array of u16
  writeU32(chunk.lines.length);
  const linesBuf = Buffer.alloc(chunk.lines.length * 2);
  for (let i = 0; i < chunk.lines.length; i++) {
    linesBuf.writeUInt16BE(chunk.lines[i], i * 2);
  }
  parts.push(linesBuf);

  // 7. Serialize constants
  writeU16(chunk.constants.length);
  for (const val of chunk.constants) {
    if (val === null) {
      writeByte(0x00);
    } else if (typeof val === "boolean") {
      writeByte(val ? 0x02 : 0x01);
    } else if (typeof val === "number") {
      writeByte(0x03);
      writeF64(val);
    } else if (typeof val === "string") {
      writeByte(0x04);
      writeString(val);
    } else if (typeof val === "object" && val.type === "function") {
      writeByte(0x05);
      const subBuf = serialize(val.chunk);
      parts.push(subBuf);
    } else {
      throw new Error(`Unsupported constant type: ${typeof val}`);
    }
  }

  return Buffer.concat(parts);
}

export function serializeProgram(chunk: Chunk): Buffer {
  const header = Buffer.alloc(8);
  // Magic bytes "HKDB"
  header.write("HKDB", 0, "ascii");
  // Format version
  header.writeUInt8(1, 4);
  // Language major
  header.writeUInt8(0, 5);
  // Language minor
  header.writeUInt8(1, 6);
  // Runtime ABI
  header.writeUInt8(1, 7);

  const body = serialize(chunk);
  return Buffer.concat([header, body]);
}

export function deserializeProgram(buffer: Buffer): Chunk {
  if (buffer.length < 8) {
    throw new Error(`Malformed HKDB bytecode: buffer length ${buffer.length} is shorter than 8-byte header`);
  }

  const magic = buffer.toString("ascii", 0, 4);
  if (magic !== "HKDB") {
    throw new Error(`Invalid HKDB magic bytes: expected 'HKDB', found '${magic}'`);
  }

  const formatVersion = buffer.readUInt8(4);
  if (formatVersion !== 1) {
    throw new Error(`Unsupported HKDB bytecode format version: ${formatVersion}`);
  }

  let offset = 8;
  const readResult = deserializeChunk(buffer, offset);
  return readResult.chunk;
}

function deserializeChunk(buffer: Buffer, startOffset: number): { chunk: Chunk; nextOffset: number } {
  let offset = startOffset;

  const checkAvailable = (bytes: number) => {
    if (offset + bytes > buffer.length) {
      throw new Error(`Corrupted HKDB bytecode: unexpected end of buffer at offset ${offset}`);
    }
  };

  // 1. Read name
  checkAvailable(2);
  const nameLen = buffer.readUInt16BE(offset);
  offset += 2;
  checkAvailable(nameLen);
  const name = buffer.toString("utf-8", offset, offset + nameLen);
  offset += nameLen;

  // 2. Read arity
  checkAvailable(1);
  const arity = buffer.readUInt8(offset);
  offset += 1;

  const chunk = new Chunk(name, arity);

  // 3. Read localCount
  checkAvailable(2);
  chunk.localCount = buffer.readUInt16BE(offset);
  offset += 2;

  // 4. Read upvalueCount
  checkAvailable(2);
  chunk.upvalueCount = buffer.readUInt16BE(offset);
  offset += 2;

  // 5. Read code
  checkAvailable(4);
  const codeLen = buffer.readUInt32BE(offset);
  offset += 4;
  checkAvailable(codeLen);
  chunk.code = Array.from(buffer.subarray(offset, offset + codeLen));
  offset += codeLen;

  // 6. Read lines
  checkAvailable(4);
  const linesLen = buffer.readUInt32BE(offset);
  offset += 4;
  checkAvailable(linesLen * 2);
  chunk.lines = [];
  for (let i = 0; i < linesLen; i++) {
    chunk.lines.push(buffer.readUInt16BE(offset + i * 2));
  }
  offset += linesLen * 2;

  // 7. Read constants
  checkAvailable(2);
  const constCount = buffer.readUInt16BE(offset);
  offset += 2;

  for (let i = 0; i < constCount; i++) {
    checkAvailable(1);
    const tag = buffer.readUInt8(offset);
    offset += 1;

    switch (tag) {
      case 0x00:
        chunk.constants.push(null);
        break;
      case 0x01:
        chunk.constants.push(false);
        break;
      case 0x02:
        chunk.constants.push(true);
        break;
      case 0x03:
        checkAvailable(8);
        chunk.constants.push(buffer.readDoubleBE(offset));
        offset += 8;
        break;
      case 0x04: {
        checkAvailable(2);
        const strLen = buffer.readUInt16BE(offset);
        offset += 2;
        checkAvailable(strLen);
        chunk.constants.push(buffer.toString("utf-8", offset, offset + strLen));
        offset += strLen;
        break;
      }
      case 0x05: {
        const sub = deserializeChunk(buffer, offset);
        chunk.constants.push({
          type: "function",
          name: sub.chunk.name,
          arity: sub.chunk.arity,
          upvalueCount: sub.chunk.upvalueCount,
          chunk: sub.chunk,
        });
        offset = sub.nextOffset;
        break;
      }
      default:
        throw new Error(`Corrupted HKDB constant pool: unknown type tag 0x${tag.toString(16)} at offset ${offset - 1}`);
    }
  }

  return { chunk, nextOffset: offset };
}
