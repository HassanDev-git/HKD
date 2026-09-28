"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.serialize = serialize;
exports.serializeProgram = serializeProgram;
exports.deserializeProgram = deserializeProgram;
const buffer_1 = require("buffer");
const chunk_js_1 = require("./chunk.js");
class FastBufferWriter {
    buffer;
    offset;
    constructor(initialCapacity = 16384) {
        this.buffer = buffer_1.Buffer.allocUnsafe(initialCapacity);
        this.offset = 0;
    }
    ensure(extra) {
        if (this.offset + extra > this.buffer.length) {
            const newCap = Math.max(this.buffer.length * 2, this.offset + extra + 1024);
            const newBuf = buffer_1.Buffer.allocUnsafe(newCap);
            this.buffer.copy(newBuf, 0, 0, this.offset);
            this.buffer = newBuf;
        }
    }
    writeByte(b) {
        this.ensure(1);
        this.buffer[this.offset++] = b;
    }
    writeU16(val) {
        this.ensure(2);
        this.buffer.writeUInt16BE(val, this.offset);
        this.offset += 2;
    }
    writeU32(val) {
        this.ensure(4);
        this.buffer.writeUInt32BE(val, this.offset);
        this.offset += 4;
    }
    writeF64(val) {
        this.ensure(8);
        this.buffer.writeDoubleBE(val, this.offset);
        this.offset += 8;
    }
    writeString(str) {
        const len = buffer_1.Buffer.byteLength(str, "utf-8");
        this.writeU16(len);
        this.ensure(len);
        this.buffer.write(str, this.offset, len, "utf-8");
        this.offset += len;
    }
    writeBytes(bytes) {
        const len = bytes.length;
        this.ensure(len);
        for (let i = 0; i < len; i++) {
            this.buffer[this.offset + i] = bytes[i];
        }
        this.offset += len;
    }
    toBuffer() {
        const result = buffer_1.Buffer.allocUnsafe(this.offset);
        this.buffer.copy(result, 0, 0, this.offset);
        return result;
    }
}
function serializeChunk(chunk, writer) {
    // 1. Serialize name
    writer.writeString(chunk.name);
    // 2. Serialize arity
    writer.writeByte(chunk.arity);
    // 3. Serialize localCount
    writer.writeU16(chunk.localCount);
    // 4. Serialize upvalueCount
    writer.writeU16(chunk.upvalueCount);
    // 5. Serialize code length & bytes
    writer.writeU32(chunk.code.length);
    writer.writeBytes(chunk.code);
    // 6. Serialize lines length & array of u16
    const lineCount = chunk.lines.length;
    writer.writeU32(lineCount);
    writer.ensure(lineCount * 2);
    for (let i = 0; i < lineCount; i++) {
        writer.buffer.writeUInt16BE(chunk.lines[i], writer.offset);
        writer.offset += 2;
    }
    // 7. Serialize constants
    writer.writeU16(chunk.constants.length);
    for (const val of chunk.constants) {
        if (val === null) {
            writer.writeByte(0x00);
        }
        else if (typeof val === "boolean") {
            writer.writeByte(val ? 0x02 : 0x01);
        }
        else if (typeof val === "number") {
            writer.writeByte(0x03);
            writer.writeF64(val);
        }
        else if (typeof val === "string") {
            writer.writeByte(0x04);
            writer.writeString(val);
        }
        else if (typeof val === "object" && val.type === "function") {
            writer.writeByte(0x05);
            serializeChunk(val.chunk, writer);
        }
        else {
            throw new Error(`Unsupported constant type: ${typeof val}`);
        }
    }
}
function serialize(chunk) {
    const writer = new FastBufferWriter();
    serializeChunk(chunk, writer);
    return writer.toBuffer();
}
function serializeProgram(chunk) {
    const writer = new FastBufferWriter(32768);
    // Header: 'HKDB' + format 1 + major 0 + minor 1 + abi 1
    writer.ensure(8);
    writer.buffer.write("HKDB", 0, "ascii");
    writer.buffer[4] = 1;
    writer.buffer[5] = 0;
    writer.buffer[6] = 1;
    writer.buffer[7] = 1;
    writer.offset = 8;
    serializeChunk(chunk, writer);
    return writer.toBuffer();
}
function deserializeProgram(buffer) {
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
function deserializeChunk(buffer, startOffset) {
    let offset = startOffset;
    const checkAvailable = (bytes) => {
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
    const chunk = new chunk_js_1.Chunk(name, arity);
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
//# sourceMappingURL=serializer.js.map