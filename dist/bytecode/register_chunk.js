"use strict";
/**
 * HKD Register-Based Bytecode Architecture
 *
 * Defines the instruction format, opcode definitions, and RegisterChunk
 * for Phase 9C Register VM execution.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegisterChunk = exports.RegOp = void 0;
var RegOp;
(function (RegOp) {
    RegOp[RegOp["Nop"] = 0] = "Nop";
    RegOp[RegOp["LoadConst"] = 1] = "LoadConst";
    RegOp[RegOp["LoadImm"] = 2] = "LoadImm";
    RegOp[RegOp["LoadNull"] = 3] = "LoadNull";
    RegOp[RegOp["LoadTrue"] = 4] = "LoadTrue";
    RegOp[RegOp["LoadFalse"] = 5] = "LoadFalse";
    RegOp[RegOp["Move"] = 6] = "Move";
    RegOp[RegOp["LoadGlobal"] = 7] = "LoadGlobal";
    RegOp[RegOp["StoreGlobal"] = 8] = "StoreGlobal";
    RegOp[RegOp["DefineGlobal"] = 9] = "DefineGlobal";
    RegOp[RegOp["Add"] = 10] = "Add";
    RegOp[RegOp["Sub"] = 11] = "Sub";
    RegOp[RegOp["Mul"] = 12] = "Mul";
    RegOp[RegOp["Div"] = 13] = "Div";
    RegOp[RegOp["Mod"] = 14] = "Mod";
    RegOp[RegOp["Pow"] = 15] = "Pow";
    RegOp[RegOp["Neg"] = 16] = "Neg";
    RegOp[RegOp["Eq"] = 17] = "Eq";
    RegOp[RegOp["Ne"] = 18] = "Ne";
    RegOp[RegOp["Lt"] = 19] = "Lt";
    RegOp[RegOp["Le"] = 20] = "Le";
    RegOp[RegOp["Gt"] = 21] = "Gt";
    RegOp[RegOp["Ge"] = 22] = "Ge";
    RegOp[RegOp["Not"] = 23] = "Not";
    RegOp[RegOp["BitAnd"] = 24] = "BitAnd";
    RegOp[RegOp["BitOr"] = 25] = "BitOr";
    RegOp[RegOp["BitXor"] = 26] = "BitXor";
    RegOp[RegOp["BitNot"] = 27] = "BitNot";
    RegOp[RegOp["Shl"] = 28] = "Shl";
    RegOp[RegOp["Shr"] = 29] = "Shr";
    RegOp[RegOp["Jump"] = 30] = "Jump";
    RegOp[RegOp["JumpIf"] = 31] = "JumpIf";
    RegOp[RegOp["JumpIfNot"] = 32] = "JumpIfNot";
    RegOp[RegOp["JumpNull"] = 33] = "JumpNull";
    RegOp[RegOp["Call"] = 34] = "Call";
    RegOp[RegOp["Return"] = 35] = "Return";
    RegOp[RegOp["MakeClosure"] = 36] = "MakeClosure";
    RegOp[RegOp["LoadUpvalue"] = 37] = "LoadUpvalue";
    RegOp[RegOp["StoreUpvalue"] = 38] = "StoreUpvalue";
    RegOp[RegOp["CloseUpvalue"] = 39] = "CloseUpvalue";
    RegOp[RegOp["MakeArray"] = 40] = "MakeArray";
    RegOp[RegOp["GetIndex"] = 41] = "GetIndex";
    RegOp[RegOp["SetIndex"] = 42] = "SetIndex";
    RegOp[RegOp["ArrayLen"] = 43] = "ArrayLen";
    RegOp[RegOp["MakeObject"] = 44] = "MakeObject";
    RegOp[RegOp["GetField"] = 45] = "GetField";
    RegOp[RegOp["SetField"] = 46] = "SetField";
    RegOp[RegOp["MakeIter"] = 47] = "MakeIter";
    RegOp[RegOp["IterNext"] = 48] = "IterNext";
    RegOp[RegOp["Concat"] = 49] = "Concat";
    RegOp[RegOp["Halt"] = 50] = "Halt";
})(RegOp || (exports.RegOp = RegOp = {}));
class RegisterChunk {
    code = [];
    constants = [];
    registerCount = 0;
    arity = 0;
    name = "<script>";
    constructor(name = "<script>", arity = 0) {
        this.name = name;
        this.arity = arity;
    }
    emit(op, dst, src1 = 0, src2 = 0, line = 0, extra) {
        const idx = this.code.length;
        this.code.push({ op, dst, src1, src2, line, extra });
        if (dst >= this.registerCount)
            this.registerCount = dst + 1;
        if (src1 >= this.registerCount)
            this.registerCount = src1 + 1;
        if (op === RegOp.Call) {
            const maxReg = src1 + (extra?.argc || 0);
            if (maxReg > this.registerCount)
                this.registerCount = maxReg;
        }
        else if (op === RegOp.MakeArray || op === RegOp.Concat) {
            const maxReg = src1 + src2;
            if (maxReg > this.registerCount)
                this.registerCount = maxReg;
        }
        else if (op === RegOp.MakeObject) {
            const maxReg = src1 + src2 * 2;
            if (maxReg > this.registerCount)
                this.registerCount = maxReg;
        }
        else if (op !== RegOp.LoadConst && op !== RegOp.LoadGlobal && op !== RegOp.StoreGlobal &&
            op !== RegOp.DefineGlobal && op !== RegOp.GetField && op !== RegOp.SetField &&
            op !== RegOp.Jump && op !== RegOp.JumpIf && op !== RegOp.JumpIfNot && op !== RegOp.JumpNull &&
            op !== RegOp.IterNext) {
            if (src2 >= this.registerCount)
                this.registerCount = src2 + 1;
        }
        return idx;
    }
    disassemble() {
        const lines = [];
        lines.push(`== [RegisterChunk] ${this.name} ==`);
        lines.push(`  arity: ${this.arity}  registers: ${this.registerCount}  constants: ${this.constants.length}`);
        for (let i = 0; i < this.code.length; i++) {
            const ins = this.code[i];
            lines.push(`${String(i).padStart(5, "0")}  ${RegOp[ins.op].padEnd(14)} dst=r${ins.dst} src1=r${ins.src1} src2=${ins.src2}`);
        }
        return lines.join("\n");
    }
}
exports.RegisterChunk = RegisterChunk;
//# sourceMappingURL=register_chunk.js.map