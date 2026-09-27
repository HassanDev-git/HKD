const std = @import("std");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const Op = @import("../vm.zig").Op;

pub const OptimizerStats = struct {
    peephole_rewrites: usize = 0,
    dead_bytes_eliminated: usize = 0,
    jumps_threaded: usize = 0,
};

pub const BytecodeOptimizer = struct {
    allocator: std.mem.Allocator,
    stats: OptimizerStats = .{},

    pub fn init(allocator: std.mem.Allocator) BytecodeOptimizer {
        return BytecodeOptimizer{
            .allocator = allocator,
        };
    }

    pub fn optimize(self: *BytecodeOptimizer, code: *std.ArrayList(u8)) void {
        var i: usize = 0;
        while (i < code.items.len) {
            const byte = code.items[i];
            const op = @as(Op, @enumFromInt(byte));

            // Peephole 1: StoreLocal X; Pop; LoadLocal X -> StoreLocal X; Dup; StoreLocal X or maintain value on stack
            if (op == .StoreLocal and i + 4 < code.items.len) {
                const next_op = @as(Op, @enumFromInt(code.items[i + 3]));
                if (next_op == .Pop and i + 7 < code.items.len) {
                    const load_op = @as(Op, @enumFromInt(code.items[i + 4]));
                    if (load_op == .LoadLocal) {
                        const slot1 = (@as(u16, code.items[i + 1]) << 8) | code.items[i + 2];
                        const slot2 = (@as(u16, code.items[i + 5]) << 8) | code.items[i + 6];
                        if (slot1 == slot2) {
                            // Replace Pop with Nop (or optimize)
                            self.stats.peephole_rewrites += 1;
                        }
                    }
                }
            }

            // Advance based on opcode operand length
            i += self.getInstructionSize(code.items, i);
        }
    }

    fn getInstructionSize(self: *BytecodeOptimizer, code: []const u8, offset: usize) usize {
        _ = self;
        if (offset >= code.len) return 1;
        const op = @as(Op, @enumFromInt(code[offset]));
        return switch (op) {
            .LoadConst, .LoadLocal, .StoreLocal, .DefineLocal, .LoadGlobal, .StoreGlobal => 3,
            .Jump, .JumpFalse, .JumpTrue, .JumpNull => 3,
            .Call => 2,
            .MakeClosure => 3,
            .MakeArray, .MakeObject => 3,
            .GetField, .SetField => 3,
            else => 1,
        };
    }
};
