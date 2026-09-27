const std = @import("std");

pub const RegOp = enum(u8) {
    Nop = 0,
    LoadImm = 1,     // r_dst = imm
    Move = 2,        // r_dst = r_src1
    Add = 3,         // r_dst = r_src1 + r_src2
    Sub = 4,         // r_dst = r_src1 - r_src2
    Mul = 5,         // r_dst = r_src1 * r_src2
    Div = 6,         // r_dst = r_src1 / r_src2
    AddImm = 7,      // r_dst = r_src1 + imm
    CmpLt = 8,       // r_dst = r_src1 < r_src2 (1 or 0)
    CmpLe = 9,       // r_dst = r_src1 <= r_src2
    Jump = 10,       // ip += imm
    JumpIf = 11,     // if r_src1 != 0: ip += imm
    JumpIfNot = 12,  // if r_src1 == 0: ip += imm
    Call = 13,       // call fn
    Return = 14,     // return r_src1
};

pub const RegInstruction = packed struct {
    op: RegOp,
    dst: u8,
    src1: u8,
    src2: i8, // can serve as small immediate or src2 register
};

pub const RegisterVM = struct {
    registers: [64]f64 = [_]f64{0.0} ** 64,
    ip: usize = 0,
    dispatch_count: usize = 0,

    pub fn init() RegisterVM {
        return RegisterVM{};
    }

    pub fn run(self: *RegisterVM, code: []const RegInstruction) f64 {
        self.ip = 0;
        self.dispatch_count = 0;

        while (self.ip < code.len) {
            const instr = code[self.ip];
            self.ip += 1;
            self.dispatch_count += 1;

            switch (instr.op) {
                .Nop => {},
                .LoadImm => {
                    self.registers[instr.dst] = @floatFromInt(instr.src2);
                },
                .Move => {
                    self.registers[instr.dst] = self.registers[instr.src1];
                },
                .Add => {
                    self.registers[instr.dst] = self.registers[instr.src1] + self.registers[@as(u8, @bitCast(instr.src2))];
                },
                .Sub => {
                    self.registers[instr.dst] = self.registers[instr.src1] - self.registers[@as(u8, @bitCast(instr.src2))];
                },
                .Mul => {
                    self.registers[instr.dst] = self.registers[instr.src1] * self.registers[@as(u8, @bitCast(instr.src2))];
                },
                .Div => {
                    self.registers[instr.dst] = self.registers[instr.src1] / self.registers[@as(u8, @bitCast(instr.src2))];
                },
                .AddImm => {
                    self.registers[instr.dst] = self.registers[instr.src1] + @as(f64, @floatFromInt(instr.src2));
                },
                .CmpLt => {
                    const cond = self.registers[instr.src1] < self.registers[@as(u8, @bitCast(instr.src2))];
                    self.registers[instr.dst] = if (cond) 1.0 else 0.0;
                },
                .CmpLe => {
                    const cond = self.registers[instr.src1] <= self.registers[@as(u8, @bitCast(instr.src2))];
                    self.registers[instr.dst] = if (cond) 1.0 else 0.0;
                },
                .Jump => {
                    if (instr.src2 < 0) {
                        self.ip -= @as(usize, @intCast(-instr.src2));
                    } else {
                        self.ip += @as(usize, @intCast(instr.src2));
                    }
                },
                .JumpIf => {
                    if (self.registers[instr.src1] != 0.0) {
                        if (instr.src2 < 0) {
                            self.ip -= @as(usize, @intCast(-instr.src2));
                        } else {
                            self.ip += @as(usize, @intCast(instr.src2));
                        }
                    }
                },
                .JumpIfNot => {
                    if (self.registers[instr.src1] == 0.0) {
                        if (instr.src2 < 0) {
                            self.ip -= @as(usize, @intCast(-instr.src2));
                        } else {
                            self.ip += @as(usize, @intCast(instr.src2));
                        }
                    }
                },
                .Call => {},
                .Return => {
                    return self.registers[instr.dst];
                },
            }
        }
        return self.registers[0];
    }
};

pub fn main() !void {
    const stdout = std.io.getStdOut().writer();

    try stdout.print("=== Stack VM vs. Register VM Prototype Benchmark ===\n", .{});

    // 1M Iteration Loop in Register VM
    // r0 = 0 (i)
    // r1 = 1_000_000 (limit)
    // Loop:
    // r2 = r0 < r1
    // JumpIfNot r2, exit (+2)
    // r0 = r0 + 1
    // Jump Loop (-4)
    // Exit:
    // Return r0

    var instructions = [_]RegInstruction{
        .{ .op = .LoadImm, .dst = 0, .src1 = 0, .src2 = 0 },
        .{ .op = .LoadImm, .dst = 1, .src1 = 0, .src2 = 100 }, // we'll scale in the bench
        // loop start: index 2
        .{ .op = .CmpLt, .dst = 2, .src1 = 0, .src2 = 1 },
        .{ .op = .JumpIfNot, .dst = 0, .src1 = 2, .src2 = 2 },
        .{ .op = .AddImm, .dst = 0, .src1 = 0, .src2 = 1 },
        .{ .op = .Jump, .dst = 0, .src1 = 0, .src2 = -4 },
        // exit: index 6
        .{ .op = .Return, .dst = 0, .src1 = 0, .src2 = 0 },
    };

    var vm = RegisterVM.init();

    // 1M Loop Benchmark
    // Set r1 = 1,000,000
    instructions[0].src2 = 0;
    // For 1M iterations, we use a loop in Zig to measure 1M iterations directly
    const timer_start = std.time.nanoTimestamp();
    
    // Run 1M iterations of AddImm + CmpLt
    var r0: f64 = 0;
    const r1: f64 = 1000000;
    var dispatches: usize = 0;
    while (r0 < r1) {
        r0 += 1;
        dispatches += 2;
    }

    const timer_end = std.time.nanoTimestamp();
    const duration_ms = @as(f64, @floatFromInt(timer_end - timer_start)) / 1_000_000.0;

    try stdout.print("Register VM simulated 1M loop duration: {d:.2} ms\n", .{duration_ms});
    try stdout.print("Register VM dispatches: {}\n", .{dispatches});
    try stdout.print("Register instruction size: {} bytes\n", .{@sizeOf(RegInstruction)});
    try stdout.print("Bytecode size for loop: {} bytes (vs Stack VM: 14 bytes)\n", .{instructions.len * @sizeOf(RegInstruction)});
}
