"use strict";
/**
 * HKD Bytecode Chunk
 *
 * A Chunk holds:
 *  - A byte array of opcodes + operands
 *  - A constant pool (values referenced by index)
 *  - Line number mapping for debug info
 *  - Metadata (name, arity, local count)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chunk = void 0;
exports.formatValue = formatValue;
const opcodes_js_1 = require("./opcodes.js");
// ─── Chunk ────────────────────────────────────────────────────────────────────
class Chunk {
    code = [];
    constants = [];
    lines = []; // parallel to code: line number per byte
    name;
    arity;
    localCount = 0;
    upvalueCount = 0;
    constantMap = new Map();
    constructor(name = "<script>", arity = 0) {
        this.name = name;
        this.arity = arity;
    }
    // ── Write helpers ──────────────────────────────────────────────────────────
    writeByte(byte, line = 0) {
        const offset = this.code.length;
        this.code.push(byte & 0xff);
        this.lines.push(line);
        return offset;
    }
    writeU16(value, line = 0) {
        this.code.push((value >> 8) & 0xff, value & 0xff);
        this.lines.push(line, line);
    }
    /** Write an opcode and a 16-bit unsigned operand in a single combined push. */
    writeOpU16(op, operand, line = 0) {
        const offset = this.code.length;
        this.code.push(op, (operand >> 8) & 0xff, operand & 0xff);
        this.lines.push(line, line, line);
        return offset;
    }
    /** Write a signed 16-bit offset (for jumps). */
    writeI16(value, line = 0) {
        this.writeU16(value & 0xffff, line);
    }
    /** Add a constant to the pool and return its index. */
    addConstant(value) {
        // Deduplicate primitives in O(1)
        if (value === null ||
            typeof value === "boolean" ||
            typeof value === "number" ||
            typeof value === "string") {
            const existing = this.constantMap.get(value);
            if (existing !== undefined)
                return existing;
            const idx = this.constants.length;
            this.constants.push(value);
            this.constantMap.set(value, idx);
            return idx;
        }
        this.constants.push(value);
        return this.constants.length - 1;
    }
    /** Emit LOAD_CONST for a value. */
    emitConstant(value, line = 0) {
        const idx = this.addConstant(value);
        this.writeOpU16(1 /* Op.LoadConst */, idx, line);
    }
    /** Emit a jump instruction and return the offset of the placeholder. */
    emitJump(op, line = 0) {
        const offset = this.code.length + 1;
        this.code.push(op, 0xff, 0xff);
        this.lines.push(line, line, line);
        return offset;
    }
    /** Patch a jump placeholder with the actual offset. */
    patchJump(jumpOffset) {
        // jumpOffset points to the 2-byte placeholder
        // The jump is relative to the byte AFTER the jump instruction
        const target = this.code.length;
        const relative = target - (jumpOffset + 2); // +2 for the 2 operand bytes
        if (relative > 0x7fff || relative < -0x8000) {
            throw new Error("Jump offset too large");
        }
        const u16 = relative & 0xffff;
        this.code[jumpOffset] = (u16 >> 8) & 0xff;
        this.code[jumpOffset + 1] = u16 & 0xff;
    }
    /** Emit a loop jump back to `loopStart`. */
    emitLoop(loopStart, line = 0) {
        const offset = this.code.length + 1;
        this.code.push(80 /* Op.Jump */, 0, 0);
        this.lines.push(line, line, line);
        // Relative offset back to loopStart
        const relative = loopStart - this.code.length;
        const u16 = relative & 0xffff;
        this.code[offset] = (u16 >> 8) & 0xff;
        this.code[offset + 1] = u16 & 0xff;
    }
    // ── Read helpers (used by VM) ───────────────────────────────────────────────
    readByte(ip) {
        return this.code[ip];
    }
    readU16(ip) {
        return ((this.code[ip] << 8) | this.code[ip + 1]) >>> 0;
    }
    readI16(ip) {
        const raw = (this.code[ip] << 8) | this.code[ip + 1];
        // Sign-extend from 16 bits
        return raw > 0x7fff ? raw - 0x10000 : raw;
    }
    // ── Disassembly ────────────────────────────────────────────────────────────
    disassemble() {
        const lines = [];
        lines.push(`== ${this.name} ==`);
        lines.push(`  arity: ${this.arity}  locals: ${this.localCount}  constants: ${this.constants.length}`);
        lines.push("");
        let ip = 0;
        while (ip < this.code.length) {
            const [str, next] = this.disassembleInstruction(ip);
            lines.push(str);
            ip = next;
        }
        return lines.join("\n");
    }
    disassembleInstruction(ip) {
        const opcode = this.code[ip];
        const name = opcodes_js_1.OP_NAMES[opcode] ?? `UNKNOWN(${opcode.toString(16)})`;
        const line = this.lines[ip] ?? 0;
        const prefix = `${String(ip).padStart(5, "0")}  [${String(line).padStart(4)}]  ${name.padEnd(16)}`;
        switch (opcode) {
            case 1 /* Op.LoadConst */: {
                const idx = this.readU16(ip + 1);
                const val = this.constants[idx];
                return [`${prefix}  #${idx} (${formatValue(val)})`, ip + 3];
            }
            case 16 /* Op.LoadLocal */:
            case 17 /* Op.StoreLocal */:
            case 18 /* Op.DefineLocal */:
            case 19 /* Op.LoadGlobal */:
            case 20 /* Op.StoreGlobal */:
            case 21 /* Op.DefineGlobal */:
            case 22 /* Op.LoadUpvalue */:
            case 23 /* Op.StoreUpvalue */:
            case 112 /* Op.MakeArray */:
            case 128 /* Op.MakeObject */:
            case 115 /* Op.ArrayLen */:
            case 129 /* Op.GetField */:
            case 130 /* Op.SetField */: {
                const idx = this.readU16(ip + 1);
                return [`${prefix}  ${idx}`, ip + 3];
            }
            case 80 /* Op.Jump */:
            case 81 /* Op.JumpFalse */:
            case 82 /* Op.JumpTrue */:
            case 83 /* Op.JumpNull */:
            case 145 /* Op.IterNext */: {
                const offset = this.readI16(ip + 1);
                const target = ip + 3 + offset;
                return [`${prefix}  ${offset >= 0 ? "+" : ""}${offset} -> ${target}`, ip + 3];
            }
            case 96 /* Op.Call */: {
                const argc = this.code[ip + 1];
                return [`${prefix}  argc=${argc}`, ip + 2];
            }
            case 98 /* Op.MakeClosure */: {
                const fnIdx = this.readU16(ip + 1);
                const upCount = this.code[ip + 3];
                return [`${prefix}  fn=#${fnIdx}  upvalues=${upCount}`, ip + 4];
            }
            case 240 /* Op.LineInfo */: {
                const lineNum = this.readU16(ip + 1);
                return [`${prefix}  line=${lineNum}`, ip + 3];
            }
            // No-operand instructions
            default:
                return [`${prefix}`, ip + 1];
        }
    }
}
exports.Chunk = Chunk;
// ─── Value formatter ──────────────────────────────────────────────────────────
function formatValue(v) {
    if (v === null)
        return "null";
    if (typeof v === "boolean")
        return String(v);
    if (typeof v === "number")
        return String(v);
    if (typeof v === "string")
        return `"${v}"`;
    if (v.type === "function")
        return `<fn ${v.name}>`;
    if (v.type === "closure")
        return `<closure ${v.fn.name}>`;
    if (v.type === "native")
        return `<native ${v.name}>`;
    if (v.type === "array")
        return `[${v.elements.map(formatValue).join(", ")}]`;
    if (v.type === "object") {
        const fields = Array.from(v.fields.entries())
            .map(([k, val]) => `${k}: ${formatValue(val)}`)
            .join(", ");
        return `{${fields}}`;
    }
    return "<value>";
}
//# sourceMappingURL=chunk.js.map