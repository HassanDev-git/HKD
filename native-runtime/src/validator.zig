const std = @import("std");
const opcodes = @import("opcodes.zig");
const Op = opcodes.Op;
const value_mod = @import("value.zig");
const HkdFunction = value_mod.HkdFunction;

pub fn validateFunction(func: *const HkdFunction) anyerror!void {
    const code = func.code;
    const len = code.len;
    var ip: usize = 0;

    while (ip < len) {
        const byte = code[ip];
        ip += 1;

        switch (byte) {
            0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
            0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
            0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26,
            0x30, 0x31, 0x32, 0x33, 0x34, 0x35,
            0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46,
            0x50, 0x51, 0x52, 0x53,
            0x60, 0x61, 0x62,
            0x70, 0x71, 0x72, 0x73,
            0x80, 0x81, 0x82,
            0x90, 0x91,
            0xA0,
            0xF0,
            0xFF => {},
            else => return error.InvalidOpcode,
        }
        const op = @as(Op, @enumFromInt(byte));

        switch (op) {
            .LoadConst => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                if (idx >= func.constants.len) return error.InvalidConstantIndex;
                
                const val = func.constants[idx];
                if (val == .Function) {
                    try validateFunction(val.Function);
                }
            },
            .LoadLocal, .StoreLocal, .DefineLocal => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                if (idx >= func.local_count) return error.InvalidLocalIndex;
            },
            .LoadGlobal, .StoreGlobal, .DefineGlobal => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                if (idx >= func.constants.len) return error.InvalidConstantIndex;
                if (func.constants[idx] != .String) return error.InvalidGlobalNameType;
            },
            .LoadUpvalue, .StoreUpvalue => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                if (idx >= func.upvalue_count) return error.InvalidUpvalueIndex;
            },
            .CloseUpvalue, .LoadNull, .LoadTrue, .LoadFalse, .Pop, .Dup,
            .Add, .Sub, .Mul, .Div, .Mod, .Pow, .Neg,
            .Eq, .Ne, .Lt, .Le, .Gt, .Ge, .Not,
            .BitAnd, .BitOr, .BitXor, .BitNot, .Shl, .Shr => {},
            
            .Jump, .JumpFalse, .JumpTrue, .JumpNull => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const raw = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                const offset = if (raw > 0x7fff) @as(i16, @bitCast(raw)) else @as(i16, @intCast(raw));
                const dest = @as(i64, @intCast(ip)) + offset;
                if (dest < 0 or dest > len) return error.InvalidJumpTarget;
            },
            .Call => {
                if (ip + 1 > len) return error.TruncatedInstruction;
                ip += 1;
            },
            .Return => {},
            .MakeClosure => {
                if (ip + 3 > len) return error.TruncatedInstruction;
                const fn_const_idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                const upvalue_count = code[ip + 2];
                ip += 3;

                if (fn_const_idx >= func.constants.len) return error.InvalidConstantIndex;
                const fn_val = func.constants[fn_const_idx];
                if (fn_val != .Function) return error.InvalidClosureFunctionType;

                if (ip + (upvalue_count * 3) > len) return error.TruncatedInstruction;
                for (0..upvalue_count) |_| {
                    const is_local = code[ip];
                    ip += 3;
                    if (is_local != 0 and is_local != 1) return error.InvalidUpvalueDescriptor;
                }
            },
            .MakeArray => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                ip += 2;
            },
            .GetIndex, .SetIndex, .ArrayLen => {},
            .MakeObject => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                ip += 2;
            },
            .GetField, .SetField => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const idx = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                if (idx >= func.constants.len) return error.InvalidConstantIndex;
                if (func.constants[idx] != .String) return error.InvalidFieldNameType;
            },
            .MakeIter => {},
            .IterNext => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                const raw = (@as(u16, code[ip]) << 8) | code[ip + 1];
                ip += 2;
                const offset = if (raw > 0x7fff) @as(i16, @bitCast(raw)) else @as(i16, @intCast(raw));
                const dest = @as(i64, @intCast(ip)) + offset;
                if (dest < 0 or dest > len) return error.InvalidJumpTarget;
            },
            .Concat => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                ip += 2;
            },
            .LineInfo => {
                if (ip + 2 > len) return error.TruncatedInstruction;
                ip += 2;
            },
            .Halt => {},
        }
    }
}
