"use strict";
/**
 * HKD Bytecode Opcode Definitions
 *
 * Each opcode is a single byte (0–255).
 * The VM interprets a flat Uint8Array of opcodes + inline operands.
 *
 * Operand encoding:
 *   Most operands are 2-byte unsigned integers (big-endian).
 *   Jump offsets are signed 2-byte integers (big-endian, relative to end of jump instruction).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OP_NAMES = void 0;
/** Human-readable opcode names for disassembly. */
exports.OP_NAMES = {
    [1 /* Op.LoadConst */]: "LOAD_CONST",
    [2 /* Op.LoadNull */]: "LOAD_NULL",
    [3 /* Op.LoadTrue */]: "LOAD_TRUE",
    [4 /* Op.LoadFalse */]: "LOAD_FALSE",
    [5 /* Op.Pop */]: "POP",
    [6 /* Op.Dup */]: "DUP",
    [16 /* Op.LoadLocal */]: "LOAD_LOCAL",
    [17 /* Op.StoreLocal */]: "STORE_LOCAL",
    [18 /* Op.DefineLocal */]: "DEFINE_LOCAL",
    [19 /* Op.LoadGlobal */]: "LOAD_GLOBAL",
    [20 /* Op.StoreGlobal */]: "STORE_GLOBAL",
    [21 /* Op.DefineGlobal */]: "DEFINE_GLOBAL",
    [22 /* Op.LoadUpvalue */]: "LOAD_UPVALUE",
    [23 /* Op.StoreUpvalue */]: "STORE_UPVALUE",
    [24 /* Op.CloseUpvalue */]: "CLOSE_UPVALUE",
    [32 /* Op.Add */]: "ADD",
    [33 /* Op.Sub */]: "SUB",
    [34 /* Op.Mul */]: "MUL",
    [35 /* Op.Div */]: "DIV",
    [36 /* Op.Mod */]: "MOD",
    [37 /* Op.Pow */]: "POW",
    [38 /* Op.Neg */]: "NEG",
    [48 /* Op.Eq */]: "EQ",
    [49 /* Op.Ne */]: "NE",
    [50 /* Op.Lt */]: "LT",
    [51 /* Op.Le */]: "LE",
    [52 /* Op.Gt */]: "GT",
    [53 /* Op.Ge */]: "GE",
    [64 /* Op.Not */]: "NOT",
    [65 /* Op.BitAnd */]: "BIT_AND",
    [66 /* Op.BitOr */]: "BIT_OR",
    [67 /* Op.BitXor */]: "BIT_XOR",
    [68 /* Op.BitNot */]: "BIT_NOT",
    [69 /* Op.Shl */]: "SHL",
    [70 /* Op.Shr */]: "SHR",
    [80 /* Op.Jump */]: "JUMP",
    [81 /* Op.JumpFalse */]: "JUMP_FALSE",
    [82 /* Op.JumpTrue */]: "JUMP_TRUE",
    [83 /* Op.JumpNull */]: "JUMP_NULL",
    [96 /* Op.Call */]: "CALL",
    [97 /* Op.Return */]: "RETURN",
    [98 /* Op.MakeClosure */]: "MAKE_CLOSURE",
    [112 /* Op.MakeArray */]: "MAKE_ARRAY",
    [113 /* Op.GetIndex */]: "GET_INDEX",
    [114 /* Op.SetIndex */]: "SET_INDEX",
    [115 /* Op.ArrayLen */]: "ARRAY_LEN",
    [128 /* Op.MakeObject */]: "MAKE_OBJECT",
    [129 /* Op.GetField */]: "GET_FIELD",
    [130 /* Op.SetField */]: "SET_FIELD",
    [144 /* Op.MakeIter */]: "MAKE_ITER",
    [145 /* Op.IterNext */]: "ITER_NEXT",
    [160 /* Op.Concat */]: "CONCAT",
    [240 /* Op.LineInfo */]: "LINE_INFO",
    [255 /* Op.Halt */]: "HALT",
};
//# sourceMappingURL=opcodes.js.map