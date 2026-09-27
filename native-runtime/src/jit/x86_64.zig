// HKD Native x86_64 Machine Code Emitter & JIT Executable Memory Manager
//
// Implements genuine x86_64 machine instruction encoding and W^X executable
// memory management for the Phase 10 JIT/AOT native code generation engine.

const std = @import("std");
const builtin = @import("builtin");

pub const X86Reg = enum(u8) {
    RAX = 0,
    RCX = 1,
    RDX = 2,
    RBX = 3,
    RSP = 4,
    RBP = 5,
    RSI = 6,
    RDI = 7,
    R8  = 8,
    R9  = 9,
    R10 = 10,
    R11 = 11,
    R12 = 12,
    R13 = 13,
    R14 = 14,
    R15 = 15,
};

pub const CmpCond = enum(u8) {
    Equal,
    NotEqual,
    Less,
    LessOrEqual,
    Greater,
    GreaterOrEqual,
};

// ─── Executable Buffer with W^X Protection ──────────────────────────────────

pub const page_alignment: usize = if (builtin.os.tag.isDarwin()) 16384 else 4096;

pub const ExecutableBuffer = struct {
    ptr: [*]align(page_alignment) u8,
    size: usize,
    capacity: usize,
    is_executable: bool,

    pub fn init(capacity: usize) !ExecutableBuffer {
        const rounded_capacity = (capacity + (page_alignment - 1)) & ~@as(usize, page_alignment - 1);

        if (comptime builtin.os.tag == .windows) {
            const kernel32 = struct {
                const PAGE_READWRITE = 0x04;
                const MEM_COMMIT = 0x1000;
                const MEM_RESERVE = 0x2000;
                extern "kernel32" fn VirtualAlloc(lpAddress: ?*anyopaque, dwSize: usize, flAllocationType: u32, flProtect: u32) callconv(.winapi) ?*anyopaque;
            };

            const raw = kernel32.VirtualAlloc(null, rounded_capacity, kernel32.MEM_COMMIT | kernel32.MEM_RESERVE, kernel32.PAGE_READWRITE);
            if (raw == null) return error.OutOfMemory;

            return ExecutableBuffer{
                .ptr = @alignCast(@ptrCast(raw.?)),
                .size = 0,
                .capacity = rounded_capacity,
                .is_executable = false,
            };
        } else {
            // Linux / macOS POSIX mmap
            const PROT_READ = 0x1;
            const PROT_WRITE = 0x2;

            const res = std.posix.mmap(null, rounded_capacity, PROT_READ | PROT_WRITE, .{ .TYPE = .PRIVATE, .ANONYMOUS = true }, -1, 0) catch return error.OutOfMemory;

            return ExecutableBuffer{
                .ptr = @alignCast(res.ptr),
                .size = 0,
                .capacity = rounded_capacity,
                .is_executable = false,
            };
        }
    }

    pub fn write(self: *ExecutableBuffer, code: []const u8) !void {
        if (self.is_executable) return error.BufferAlreadyExecutable;
        if (self.size + code.len > self.capacity) return error.OutOfMemory;
        @memcpy(self.ptr[self.size .. self.size + code.len], code);
        self.size += code.len;
    }

    /// Enforces W^X: seals the buffer as executable and read-only.
    pub fn protectExecutable(self: *ExecutableBuffer) !void {
        if (self.is_executable) return;

        if (comptime builtin.os.tag == .windows) {
            const kernel32 = struct {
                const PAGE_EXECUTE_READ = 0x20;
                extern "kernel32" fn VirtualProtect(lpAddress: *anyopaque, dwSize: usize, flNewProtect: u32, lpflOldProtect: *u32) callconv(.winapi) i32;
            };

            var old_protect: u32 = 0;
            const success = kernel32.VirtualProtect(self.ptr, self.capacity, kernel32.PAGE_EXECUTE_READ, &old_protect);
            if (success == 0) return error.AccessDenied;
        } else {
            const PROT_READ = 0x1;
            const PROT_EXEC = 0x4;
            std.posix.mprotect(@alignCast(self.ptr[0..self.capacity]), PROT_READ | PROT_EXEC) catch return error.AccessDenied;
        }

        self.is_executable = true;
    }

    pub fn asFn(self: *const ExecutableBuffer, comptime FnType: type) FnType {
        return @ptrCast(self.ptr);
    }

    pub fn deinit(self: *ExecutableBuffer) void {
        if (comptime builtin.os.tag == .windows) {
            const kernel32 = struct {
                const MEM_RELEASE = 0x8000;
                extern "kernel32" fn VirtualFree(lpAddress: *anyopaque, dwSize: usize, dwFreeType: u32) callconv(.winapi) i32;
            };
            _ = kernel32.VirtualFree(self.ptr, 0, kernel32.MEM_RELEASE);
        } else {
            std.posix.munmap(@alignCast(self.ptr[0..self.capacity]));
        }
    }
};

// ─── Lightweight x86_64 Machine Code Emitter ────────────────────────────────

pub const X86_64Emitter = struct {
    code: std.ArrayList(u8),
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) X86_64Emitter {
        return .{
            .code = std.ArrayList(u8).empty,
            .allocator = allocator,
        };
    }

    pub fn deinit(self: *X86_64Emitter) void {
        self.code.deinit(self.allocator);
    }

    pub fn emitByte(self: *X86_64Emitter, b: u8) !void {
        try self.code.append(self.allocator, b);
    }

    pub fn emitBytes(self: *X86_64Emitter, bytes: []const u8) !void {
        try self.code.appendSlice(self.allocator, bytes);
    }

    pub fn emitU32(self: *X86_64Emitter, val: u32) !void {
        var buf: [4]u8 = undefined;
        std.mem.writeInt(u32, &buf, val, .little);
        try self.emitBytes(&buf);
    }

    pub fn emitU64(self: *X86_64Emitter, val: u64) !void {
        var buf: [8]u8 = undefined;
        std.mem.writeInt(u64, &buf, val, .little);
        try self.emitBytes(&buf);
    }

    // Prologue: push rbp; mov rbp, rsp; sub rsp, stack_size
    pub fn emitPrologue(self: *X86_64Emitter, stack_bytes: u32) !void {
        try self.emitByte(0x55); // push rbp
        try self.emitBytes(&[_]u8{ 0x48, 0x89, 0xE5 }); // mov rbp, rsp
        if (stack_bytes > 0) {
            // align to 16 bytes
            const aligned = (stack_bytes + 15) & ~@as(u32, 15);
            try self.emitBytes(&[_]u8{ 0x48, 0x81, 0xEC }); // sub rsp, imm32
            try self.emitU32(aligned);
        }
    }

    // Epilogue: mov rsp, rbp; pop rbp; ret
    pub fn emitEpilogue(self: *X86_64Emitter) !void {
        try self.emitBytes(&[_]u8{ 0x48, 0x89, 0xEC }); // mov rsp, rbp
        try self.emitByte(0x5D); // pop rbp
        try self.emitByte(0xC3); // ret
    }

    // mov reg, imm64
    pub fn emitMovImm64(self: *X86_64Emitter, dst: X86Reg, imm: i64) !void {
        const reg_idx = @intFromEnum(dst);
        const rex: u8 = 0x48 | (if (reg_idx >= 8) @as(u8, 0x01) else @as(u8, 0x00));
        const opcode: u8 = 0xB8 + (reg_idx & 0x07);
        try self.emitByte(rex);
        try self.emitByte(opcode);
        try self.emitU64(@as(u64, @bitCast(imm)));
    }

    // mov dst, src (64-bit)
    pub fn emitMovReg(self: *X86_64Emitter, dst: X86Reg, src: X86Reg) !void {
        const dst_idx = @intFromEnum(dst);
        const src_idx = @intFromEnum(src);
        var rex: u8 = 0x48;
        if (src_idx >= 8) rex |= 0x04;
        if (dst_idx >= 8) rex |= 0x01;
        const modrm: u8 = 0b11_000_000 | ((src_idx & 0x07) << 3) | (dst_idx & 0x07);
        try self.emitByte(rex);
        try self.emitByte(0x89);
        try self.emitByte(modrm);
    }

    // add dst, src
    pub fn emitAddReg(self: *X86_64Emitter, dst: X86Reg, src: X86Reg) !void {
        const dst_idx = @intFromEnum(dst);
        const src_idx = @intFromEnum(src);
        var rex: u8 = 0x48;
        if (src_idx >= 8) rex |= 0x04;
        if (dst_idx >= 8) rex |= 0x01;
        const modrm: u8 = 0b11_000_000 | ((src_idx & 0x07) << 3) | (dst_idx & 0x07);
        try self.emitByte(rex);
        try self.emitByte(0x01);
        try self.emitByte(modrm);
    }

    // sub dst, src
    pub fn emitSubReg(self: *X86_64Emitter, dst: X86Reg, src: X86Reg) !void {
        const dst_idx = @intFromEnum(dst);
        const src_idx = @intFromEnum(src);
        var rex: u8 = 0x48;
        if (src_idx >= 8) rex |= 0x04;
        if (dst_idx >= 8) rex |= 0x01;
        const modrm: u8 = 0b11_000_000 | ((src_idx & 0x07) << 3) | (dst_idx & 0x07);
        try self.emitByte(rex);
        try self.emitByte(0x29);
        try self.emitByte(modrm);
    }

    // imul dst, src
    pub fn emitImulReg(self: *X86_64Emitter, dst: X86Reg, src: X86Reg) !void {
        const dst_idx = @intFromEnum(dst);
        const src_idx = @intFromEnum(src);
        var rex: u8 = 0x48;
        if (dst_idx >= 8) rex |= 0x04;
        if (src_idx >= 8) rex |= 0x01;
        const modrm: u8 = 0b11_000_000 | ((dst_idx & 0x07) << 3) | (src_idx & 0x07);
        try self.emitByte(rex);
        try self.emitBytes(&[_]u8{ 0x0F, 0xAF });
        try self.emitByte(modrm);
    }

    // cmp left, right
    pub fn emitCmpReg(self: *X86_64Emitter, left: X86Reg, right: X86Reg) !void {
        const left_idx = @intFromEnum(left);
        const right_idx = @intFromEnum(right);
        var rex: u8 = 0x48;
        if (right_idx >= 8) rex |= 0x04;
        if (left_idx >= 8) rex |= 0x01;
        const modrm: u8 = 0b11_000_000 | ((right_idx & 0x07) << 3) | (left_idx & 0x07);
        try self.emitByte(rex);
        try self.emitByte(0x39);
        try self.emitByte(modrm);
    }

    // setCC dst (writes 1 or 0 to dst register)
    pub fn emitSetCC(self: *X86_64Emitter, cond: CmpCond, dst: X86Reg) !void {
        const set_opcode: u8 = switch (cond) {
            .Equal => 0x94,
            .NotEqual => 0x95,
            .Less => 0x9C,
            .LessOrEqual => 0x9E,
            .Greater => 0x9F,
            .GreaterOrEqual => 0x9D,
        };
        // setcc al
        try self.emitBytes(&[_]u8{ 0x0F, set_opcode, 0xC0 });
        // movzx dst, al
        const dst_idx = @intFromEnum(dst);
        var rex: u8 = 0x48;
        if (dst_idx >= 8) rex |= 0x04;
        const modrm: u8 = 0b11_000_000 | ((dst_idx & 0x07) << 3) | 0x00;
        try self.emitByte(rex);
        try self.emitBytes(&[_]u8{ 0x0F, 0xB6 });
        try self.emitByte(modrm);
    }

    // push reg
    pub fn emitPushReg(self: *X86_64Emitter, reg: X86Reg) !void {
        const idx = @intFromEnum(reg);
        if (idx >= 8) {
            try self.emitByte(0x41);
            try self.emitByte(0x50 + (idx & 0x07));
        } else {
            try self.emitByte(0x50 + idx);
        }
    }

    // pop reg
    pub fn emitPopReg(self: *X86_64Emitter, reg: X86Reg) !void {
        const idx = @intFromEnum(reg);
        if (idx >= 8) {
            try self.emitByte(0x41);
            try self.emitByte(0x58 + (idx & 0x07));
        } else {
            try self.emitByte(0x58 + idx);
        }
    }

    // sub reg, imm32
    pub fn emitSubImm32(self: *X86_64Emitter, reg: X86Reg, imm: u32) !void {
        const idx = @intFromEnum(reg);
        const rex: u8 = 0x48 | (if (idx >= 8) @as(u8, 0x01) else @as(u8, 0x00));
        try self.emitByte(rex);
        try self.emitByte(0x81);
        try self.emitByte(0xE8 + (idx & 0x07));
        try self.emitU32(imm);
    }

    // add reg, imm32
    pub fn emitAddImm32(self: *X86_64Emitter, reg: X86Reg, imm: u32) !void {
        const idx = @intFromEnum(reg);
        const rex: u8 = 0x48 | (if (idx >= 8) @as(u8, 0x01) else @as(u8, 0x00));
        try self.emitByte(rex);
        try self.emitByte(0x81);
        try self.emitByte(0xC0 + (idx & 0x07));
        try self.emitU32(imm);
    }

    // call rel32
    pub fn emitCallRel32(self: *X86_64Emitter, offset: i32) !void {
        try self.emitByte(0xE8);
        try self.emitU32(@as(u32, @bitCast(offset)));
    }

    // jmp rel32
    pub fn emitJmpRel32(self: *X86_64Emitter, offset: i32) !void {
        try self.emitByte(0xE9);
        try self.emitU32(@as(u32, @bitCast(offset)));
    }

    // jle rel32
    pub fn emitJleRel32(self: *X86_64Emitter, offset: i32) !void {
        try self.emitBytes(&[_]u8{ 0x0F, 0x8E });
        try self.emitU32(@as(u32, @bitCast(offset)));
    }
};

// ─── Unit Test: Real Machine Code Execution ─────────────────────────────────

test "x86_64 native machine code execution" {
    if (comptime builtin.cpu.arch != .x86_64) return;

    var emitter = X86_64Emitter.init(std.testing.allocator);
    defer emitter.deinit();

    // Compile:
    // fn compute(a, b) -> (a + b) * 2
    // Windows: arg0 in RCX, arg1 in RDX
    // Linux: arg0 in RDI, arg1 in RSI
    try emitter.emitPrologue(32);

    if (comptime builtin.os.tag == .windows) {
        // mov rax, rcx
        try emitter.emitMovReg(.RAX, .RCX);
        // add rax, rdx
        try emitter.emitAddReg(.RAX, .RDX);
    } else {
        // mov rax, rdi
        try emitter.emitMovReg(.RAX, .RDI);
        // add rax, rsi
        try emitter.emitAddReg(.RAX, .RSI);
    }

    // mov rdx, 2
    try emitter.emitMovImm64(.RDX, 2);
    // imul rax, rdx
    try emitter.emitImulReg(.RAX, .RDX);

    try emitter.emitEpilogue();

    // Allocate executable memory
    var exec_buf = try ExecutableBuffer.init(emitter.code.items.len);
    defer exec_buf.deinit();

    try exec_buf.write(emitter.code.items);
    try exec_buf.protectExecutable();

    const NativeFn = *const fn (i64, i64) callconv(.c) i64;
    const native_fn = exec_buf.asFn(NativeFn);

    // Call genuine CPU machine code!
    const result = native_fn(20, 1);
    try std.testing.expectEqual(@as(i64, 42), result);

    const result2 = native_fn(100, 50);
    try std.testing.expectEqual(@as(i64, 300), result2);
}
