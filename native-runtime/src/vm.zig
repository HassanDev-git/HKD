const std = @import("std");
const opcodes_mod = @import("opcodes.zig");
const Op = opcodes_mod.Op;
const value_mod = @import("value.zig");
const Value = value_mod.Value;
const ValueType = value_mod.ValueType;
const HkdString = value_mod.HkdString;
const HkdArray = value_mod.HkdArray;
const HkdObject = value_mod.HkdObject;
const HkdFunction = value_mod.HkdFunction;
const HkdClosure = value_mod.HkdClosure;
const HkdIterator = value_mod.HkdIterator;
const Upvalue = value_mod.Upvalue;
const allocString = value_mod.allocString;
const allocArray = value_mod.allocArray;
const allocObject = value_mod.allocObject;
const allocClosure = value_mod.allocClosure;
const allocUpvalue = value_mod.allocUpvalue;
const allocIterator = value_mod.allocIterator;
const retain = value_mod.retain;
const release = value_mod.release;
const releaseUpvalue = value_mod.releaseUpvalue;
const stdlib = @import("stdlib.zig");
const main_mod = @import("main.zig");
const profiler = @import("profiler/profiler.zig");

pub const CallFrame = struct {
    function: *HkdFunction,
    closure: ?*HkdClosure,
    ip: usize,
    base: usize,
};

pub const VMError = error{
    RuntimeError,
};

pub const enable_opcode_profiling = false; // Set to true to print instruction statistics on deinit

pub const ExecutionContext = struct {
    stack: [2048]Value = undefined,
    stack_top: usize = 0,
    frames: [256]CallFrame = undefined,
    frame_count: usize = 0,
    open_upvalues: ?*Upvalue = null,
    yielded_argc: ?u8 = null,
};

pub const CacheState = enum(u8) {
    Uninitialized = 0,
    Monomorphic = 1,
    Polymorphic = 2,
    Megamorphic = 3,
};

pub const ShapeCacheEntry = struct {
    cached_obj: ?*value_mod.HkdObject = null,
    cached_name: ?[]const u8 = null,
    cached_val: Value = .Null,
};

pub const InlineCacheEntry = struct {
    state: CacheState = .Uninitialized,
    entries: [4]ShapeCacheEntry = [_]ShapeCacheEntry{.{}} ** 4,
    entry_count: u8 = 0,

    pub fn lookup(self: *InlineCacheEntry, obj: *value_mod.HkdObject, name: []const u8) ?Value {
        if (self.state == .Megamorphic) return null;

        var i: usize = 0;
        while (i < self.entry_count) : (i += 1) {
            const entry = &self.entries[i];
            if (entry.cached_obj == obj and entry.cached_name != null and std.mem.eql(u8, entry.cached_name.?, name)) {
                return entry.cached_val;
            }
        }
        return null;
    }

    pub fn insert(self: *InlineCacheEntry, obj: *value_mod.HkdObject, name: []const u8, val: Value) void {
        if (self.state == .Megamorphic) return;

        if (self.entry_count < 4) {
            self.entries[self.entry_count] = .{
                .cached_obj = obj,
                .cached_name = name,
                .cached_val = val,
            };
            self.entry_count += 1;
            if (self.entry_count == 1) {
                self.state = .Monomorphic;
            } else {
                self.state = .Polymorphic;
            }
        } else {
            self.state = .Megamorphic;
        }
    }

    pub fn invalidate(self: *InlineCacheEntry) void {
        self.state = .Uninitialized;
        self.entry_count = 0;
        self.entries = [_]ShapeCacheEntry{.{}} ** 4;
    }
};

pub const VM = struct {
    allocator: std.mem.Allocator,
    default_ctx: ExecutionContext = ExecutionContext{},
    active_ctx: *ExecutionContext = undefined,
    globals: std.StringHashMap(Value),
    opcode_counts: [256]usize = [_]usize{0} ** 256,
    inline_caches: [256]InlineCacheEntry = [_]InlineCacheEntry{.{}} ** 256,
    array_module: ?Value = null,
    string_module: ?Value = null,

    pub fn init(allocator: std.mem.Allocator) VM {
        var vm = VM{
            .allocator = allocator,
            .globals = std.StringHashMap(Value).init(allocator),
            .inline_caches = [_]InlineCacheEntry{.{}} ** 256,
            .array_module = null,
            .string_module = null,
        };
        vm.active_ctx = &vm.default_ctx;
        vm.registerBuiltins() catch {};
        return vm;
    }

    pub fn deinit(self: *VM) void {
        if (enable_opcode_profiling) {
            std.debug.print("\nOpcode                 Executions\n", .{});
            std.debug.print("---------------------------------\n", .{});
            inline for (@typeInfo(Op).@"enum".fields) |field| {
                const count = self.opcode_counts[field.value];
                if (count > 0) {
                    std.debug.print("{s:<22} {}\n", .{ field.name, count });
                }
            }
            std.debug.print("---------------------------------\n\n", .{});
        }

        if (self.array_module) |m| {
            release(self.allocator, m);
        }
        if (self.string_module) |m| {
            release(self.allocator, m);
        }

        // Free globals
        var it = self.globals.iterator();
        while (it.next()) |entry| {
            self.allocator.free(entry.key_ptr.*);
            release(self.allocator, entry.value_ptr.*);
        }
        self.globals.deinit();

        // Free stack remaining values
        while (self.active_ctx.stack_top > 0) {
            self.active_ctx.stack_top -= 1;
            release(self.allocator, self.active_ctx.stack[self.active_ctx.stack_top]);
        }
    }

    pub inline fn push(self: *VM, val: Value) void {
        self.active_ctx.stack[self.active_ctx.stack_top] = val;
        self.active_ctx.stack_top += 1;
        retain(val);
    }

    pub inline fn pop(self: *VM) Value {
        self.active_ctx.stack_top -= 1;
        const val = self.active_ctx.stack[self.active_ctx.stack_top];
        // We do NOT release here, because the caller takes ownership of the returned Value and is responsible for releasing it later!
        return val;
    }

    pub inline fn peek(self: *VM, distance: usize) Value {
        return self.active_ctx.stack[self.active_ctx.stack_top - 1 - distance];
    }

    inline fn readByte(frame: *CallFrame) u8 {
        const b = frame.function.code[frame.ip];
        frame.ip += 1;
        return b;
    }

    inline fn readU16(frame: *CallFrame) u16 {
        const code = frame.function.code;
        const val = (@as(u16, code[frame.ip]) << 8) | code[frame.ip + 1];
        frame.ip += 2;
        return val;
    }

    inline fn readI16(frame: *CallFrame) i16 {
        const raw = readU16(frame);
        return if (raw > 0x7fff) @as(i16, @bitCast(raw)) else @as(i16, @intCast(raw));
    }

    inline fn readConst(frame: *CallFrame, idx: u16) Value {
        return frame.function.constants[idx];
    }

    fn closeUpvalues(self: *VM, limit: usize) void {
        while (self.active_ctx.open_upvalues) |uv| {
            if (uv.stack_index >= limit) {
                uv.value = self.active_ctx.stack[uv.stack_index];
                retain(uv.value);
                uv.closed = true;
                self.active_ctx.open_upvalues = uv.next;
            } else {
                break;
            }
        }
    }

    fn captureUpvalue(self: *VM, stack_idx: usize) !*Upvalue {
        var prev_uv: ?*Upvalue = null;
        var curr_uv = self.active_ctx.open_upvalues;

        while (curr_uv) |uv| {
            if (uv.stack_index == stack_idx) {
                return uv;
            }
            if (uv.stack_index < stack_idx) {
                break;
            }
            prev_uv = uv;
            curr_uv = uv.next;
        }

        const new_uv = try allocUpvalue(self.allocator, stack_idx);
        new_uv.next = curr_uv;

        if (prev_uv) |p| {
            p.next = new_uv;
        } else {
            self.active_ctx.open_upvalues = new_uv;
        }

        return new_uv;
    }

    fn runtimeError(self: *VM, comptime format: []const u8, args: anytype) VMError {
        std.debug.print("HKD Runtime Error: " ++ format ++ "\n", args);
        // Print backtrace
        var i = self.active_ctx.frame_count;
        while (i > 0) {
            i -= 1;
            const frame = self.active_ctx.frames[i];
            const ip = frame.ip;
            const line = if (ip > 0 and ip - 1 < frame.function.lines.len) frame.function.lines[ip - 1] else 0;
            std.debug.print("  at {s} (line: {})\n", .{ frame.function.name, line });
        }
        return error.RuntimeError;
    }

    pub fn run(self: *VM, main_fn: *HkdFunction) !Value {
        self.active_ctx = &self.default_ctx;
        self.push(Value{ .Function = main_fn });
        self.active_ctx.frames[0] = CallFrame{
            .function = main_fn,
            .closure = null,
            .ip = 0,
            .base = 1,
        };
        self.active_ctx.frame_count = 1;

        return try self.execute();
    }

    fn execute(self: *VM) !Value {
        var frame = &self.active_ctx.frames[self.active_ctx.frame_count - 1];
        while (true) {
            const byte = readByte(frame);
            if (enable_opcode_profiling) {
                self.opcode_counts[byte] += 1;
            }
            const op = @as(Op, @enumFromInt(byte));

            switch (op) {
                .LoadConst => {
                    const idx = readU16(frame);
                    const val = readConst(frame, idx);
                    self.push(val);
                },
                .LoadNull => self.push(.Null),
                .LoadTrue => self.push(Value{ .Boolean = true }),
                .LoadFalse => self.push(Value{ .Boolean = false }),
                .Pop => {
                    const val = self.pop();
                    release(self.allocator, val);
                },
                .Dup => {
                    const val = self.peek(0);
                    self.push(val);
                },
                .LoadLocal => {
                    const slot = readU16(frame);
                    self.push(self.active_ctx.stack[frame.base + slot]);
                },
                .StoreLocal => {
                    const slot = readU16(frame);
                    const val = self.peek(0);
                    const old = self.active_ctx.stack[frame.base + slot];
                    self.active_ctx.stack[frame.base + slot] = val;
                    retain(val);
                    release(self.allocator, old);
                },
                .DefineLocal => {
                    const slot = readU16(frame);
                    const val = self.pop();
                    self.active_ctx.stack[frame.base + slot] = val;
                    // Transfer ownership of val directly to the stack slot (no release needed)
                },
                .LoadGlobal => {
                    const name_idx = readU16(frame);
                    const name_val = readConst(frame, name_idx);
                    const name = name_val.String.chars;
                    if (self.globals.get(name)) |val| {
                        self.push(val);
                    } else {
                        return self.runtimeError("Undefined variable `{s}`", .{name});
                    }
                },
                .StoreGlobal => {
                    const name_idx = readU16(frame);
                    const name_val = readConst(frame, name_idx);
                    const name = name_val.String.chars;
                    const val = self.peek(0);
                    if (self.globals.getEntry(name)) |entry| {
                        const old = entry.value_ptr.*;
                        entry.value_ptr.* = val;
                        retain(val);
                        release(self.allocator, old);
                    } else {
                        return self.runtimeError("Undefined variable `{s}`", .{name});
                    }
                },
                .DefineGlobal => {
                    const name_idx = readU16(frame);
                    const name_val = readConst(frame, name_idx);
                    const name = name_val.String.chars;
                    const val = self.pop();
                    if (self.globals.getEntry(name)) |entry| {
                        const old = entry.value_ptr.*;
                        entry.value_ptr.* = val;
                        release(self.allocator, old);
                    } else {
                        try self.globals.put(try self.allocator.dupe(u8, name), val);
                    }
                },
                .LoadUpvalue => {
                    const slot = readU16(frame);
                    const uv = frame.closure.?.upvalues[slot];
                    if (uv.closed) {
                        self.push(uv.value);
                    } else {
                        self.push(self.active_ctx.stack[uv.stack_index]);
                    }
                },
                .StoreUpvalue => {
                    const slot = readU16(frame);
                    const uv = frame.closure.?.upvalues[slot];
                    const val = self.peek(0);
                    if (uv.closed) {
                        const old = uv.value;
                        uv.value = val;
                        retain(val);
                        release(self.allocator, old);
                    } else {
                        const old = self.active_ctx.stack[uv.stack_index];
                        self.active_ctx.stack[uv.stack_index] = val;
                        retain(val);
                        release(self.allocator, old);
                    }
                },
                .CloseUpvalue => {
                    self.closeUpvalues(self.active_ctx.stack_top - 1);
                    const val = self.pop();
                    release(self.allocator, val);
                },
                .Add => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];

                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Number = a.Number + b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);

                        if (a_val == .String or b_val == .String) {
                            // String concatenation
                            var temp1 = std.ArrayList(u8).empty;
                            defer temp1.deinit(self.allocator);
                            var s1: []const u8 = undefined;
                            if (a_val == .String) {
                                s1 = a_val.String.chars;
                            } else {
                                var aw1 = std.Io.Writer.Allocating.fromArrayList(self.allocator, &temp1);
                                try a_val.print(&aw1.writer);
                                temp1 = aw1.toArrayList();
                                s1 = temp1.items;
                            }

                            var temp2 = std.ArrayList(u8).empty;
                            defer temp2.deinit(self.allocator);
                            var s2: []const u8 = undefined;
                            if (b_val == .String) {
                                s2 = b_val.String.chars;
                            } else {
                                var aw2 = std.Io.Writer.Allocating.fromArrayList(self.allocator, &temp2);
                                try b_val.print(&aw2.writer);
                                temp2 = aw2.toArrayList();
                                s2 = temp2.items;
                            }

                            const joined = try std.mem.concat(self.allocator, u8, &[_][]const u8{ s1, s2 });
                            defer self.allocator.free(joined);
                            
                            const str = try allocString(self.allocator, joined);
                            self.push(Value{ .String = str });
                            release(self.allocator, Value{ .String = str });
                        } else {
                            return self.runtimeError("Invalid types for addition", .{});
                        }
                    }
                },
                .Sub => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Number = a.Number - b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("Subtraction requires numbers", .{});
                    }
                },
                .Mul => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Number = a.Number * b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("Multiplication requires numbers", .{});
                    }
                },
                .Div => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        if (b.Number == 0) return self.runtimeError("Division by zero", .{});
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Number = a.Number / b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("Division requires numbers", .{});
                    }
                },
                .Mod => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        if (b.Number == 0) return self.runtimeError("Division by zero", .{});
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Number = @mod(a.Number, b.Number) };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("Modulo requires numbers", .{});
                    }
                },
                .Pow => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        self.push(Value{ .Number = std.math.pow(f64, a.Number, b.Number) });
                    } else return self.runtimeError("Power requires numbers", .{});
                },
                .Neg => {
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number) {
                        self.push(Value{ .Number = -a.Number });
                    } else return self.runtimeError("Negation requires number", .{});
                },
                .Eq => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    self.push(Value{ .Boolean = self.valuesEqual(a, b) });
                },
                .Ne => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    self.push(Value{ .Boolean = !self.valuesEqual(a, b) });
                },
                .Lt => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Boolean = a.Number < b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("LT comparison requires numbers", .{});
                    }
                },
                .Le => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Boolean = a.Number <= b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("LE comparison requires numbers", .{});
                    }
                },
                .Gt => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Boolean = a.Number > b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("GT comparison requires numbers", .{});
                    }
                },
                .Ge => {
                    const b = self.active_ctx.stack[self.active_ctx.stack_top - 1];
                    const a = self.active_ctx.stack[self.active_ctx.stack_top - 2];
                    if (a == .Number and b == .Number) {
                        self.active_ctx.stack[self.active_ctx.stack_top - 2] = Value{ .Boolean = a.Number >= b.Number };
                        self.active_ctx.stack_top -= 1;
                    } else {
                        const b_val = self.pop();
                        defer release(self.allocator, b_val);
                        const a_val = self.pop();
                        defer release(self.allocator, a_val);
                        return self.runtimeError("GE comparison requires numbers", .{});
                    }
                },
                .Not => {
                    const a = self.pop();
                    defer release(self.allocator, a);
                    self.push(Value{ .Boolean = !a.isTruthy() });
                },
                .BitAnd => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        const nb = @as(i64, @intFromFloat(b.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(na & nb)) });
                    } else return self.runtimeError("BitAnd requires numbers", .{});
                },
                .BitOr => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        const nb = @as(i64, @intFromFloat(b.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(na | nb)) });
                    } else return self.runtimeError("BitOr requires numbers", .{});
                },
                .BitXor => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        const nb = @as(i64, @intFromFloat(b.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(na ^ nb)) });
                    } else return self.runtimeError("BitXor requires numbers", .{});
                },
                .BitNot => {
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(~na)) });
                    } else return self.runtimeError("BitNot requires number", .{});
                },
                .Shl => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        const nb = @as(u6, @intFromFloat(b.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(na << nb)) });
                    } else return self.runtimeError("Shl requires numbers", .{});
                },
                .Shr => {
                    const b = self.pop();
                    defer release(self.allocator, b);
                    const a = self.pop();
                    defer release(self.allocator, a);
                    if (a == .Number and b == .Number) {
                        const na = @as(i64, @intFromFloat(a.Number));
                        const nb = @as(u6, @intFromFloat(b.Number));
                        self.push(Value{ .Number = @as(f64, @floatFromInt(na >> nb)) });
                    } else return self.runtimeError("Shr requires numbers", .{});
                },
                .Jump => {
                    const offset = readI16(frame);
                    // offset is relative to the end of the jump instruction, which is where ip is now.
                    if (offset < 0) {
                        frame.ip -= @as(usize, @intCast(-offset));
                        if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                            profiler.global_profiler.recordLoop(frame.ip);
                        }
                    } else {
                        frame.ip += @as(usize, @intCast(offset));
                    }
                },
                .JumpFalse => {
                    const offset = readI16(frame);
                    const val = self.peek(0);
                    const taken = !val.isTruthy();
                    if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                        profiler.global_profiler.recordBranch(frame.ip, taken);
                    }
                    if (taken) {
                        if (offset < 0) {
                            frame.ip -= @as(usize, @intCast(-offset));
                        } else {
                            frame.ip += @as(usize, @intCast(offset));
                        }
                    }
                },
                .JumpTrue => {
                    const offset = readI16(frame);
                    const val = self.peek(0);
                    const taken = val.isTruthy();
                    if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                        profiler.global_profiler.recordBranch(frame.ip, taken);
                    }
                    if (taken) {
                        if (offset < 0) {
                            frame.ip -= @as(usize, @intCast(-offset));
                        } else {
                            frame.ip += @as(usize, @intCast(offset));
                        }
                    }
                },
                .JumpNull => {
                    const offset = readI16(frame);
                    const val = self.peek(0);
                    if (val == .Null) {
                        if (offset < 0) {
                            frame.ip -= @as(usize, @intCast(-offset));
                        } else {
                            frame.ip += @as(usize, @intCast(offset));
                        }
                    }
                },
                .Call => {
                    const argc = readByte(frame);
                    const callee = self.peek(argc);

                    // Self-tail call optimization
                    if (frame.ip < frame.function.code.len and frame.function.code[frame.ip] == @intFromEnum(Op.Return)) {
                        const is_self_fn = (callee == .Function and callee.Function == frame.function);
                        const is_self_cl = (callee == .Closure and callee.Closure.function == frame.function);
                        if ((is_self_fn or is_self_cl) and frame.function.arity == argc and self.active_ctx.open_upvalues == null) {
                            self.doTailCall(frame, argc);
                            continue;
                        }
                    }

                    try self.callValue(callee, argc);
                    frame = &self.active_ctx.frames[self.active_ctx.frame_count - 1];
                },
                .Return => {
                    const result = self.pop();
                    if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                        profiler.global_profiler.recordReturn(frame.function.name, result);
                    }
                    if (self.active_ctx.open_upvalues != null) {
                        self.closeUpvalues(frame.base);
                    }
                    
                    self.active_ctx.frame_count -= 1;

                    // Clean the stack frame values
                    while (self.active_ctx.stack_top > frame.base - 1) {
                        self.active_ctx.stack_top -= 1;
                        release(self.allocator, self.active_ctx.stack[self.active_ctx.stack_top]);
                    }

                    if (self.active_ctx.frame_count == 0) {
                        return result; // return value gets returned from run()
                    }

                    self.active_ctx.stack[self.active_ctx.stack_top] = result;
                    self.active_ctx.stack_top += 1;
                    frame = &self.active_ctx.frames[self.active_ctx.frame_count - 1];
                },
                .MakeClosure => {
                    const fn_const_idx = readU16(frame);
                    const upvalue_count = readByte(frame);
                    const fn_const = readConst(frame, fn_const_idx);

                    const upvalues = try self.allocator.alloc(*Upvalue, upvalue_count);
                    errdefer self.allocator.free(upvalues);

                    for (0..upvalue_count) |i| {
                        const is_local = readByte(frame) == 1;
                        const idx = readU16(frame);
                        if (is_local) {
                            upvalues[i] = try self.captureUpvalue(frame.base + idx);
                            upvalues[i].ref_count += 1;
                        } else {
                            upvalues[i] = frame.closure.?.upvalues[idx];
                            upvalues[i].ref_count += 1;
                        }
                    }

                    const closure = try allocClosure(self.allocator, fn_const.Function, upvalues);
                    self.push(Value{ .Closure = closure });
                },
                .MakeArray => {
                    const n = readU16(frame);
                    const arr = try allocArray(self.allocator);
                    errdefer release(self.allocator, Value{ .Array = arr });
                    try arr.elements.ensureTotalCapacity(self.allocator, n);

                    if (n > 0) {
                        const slice = self.active_ctx.stack[self.active_ctx.stack_top - n .. self.active_ctx.stack_top];
                        arr.elements.appendSliceAssumeCapacity(slice);
                    }

                    // Remove from stack without releasing (transferred to array)
                    self.active_ctx.stack_top -= n;
                    self.push(Value{ .Array = arr });
                    release(self.allocator, Value{ .Array = arr }); // stack has a reference now
                },
                .GetIndex => {
                    const idx_val = self.pop();
                    defer release(self.allocator, idx_val);
                    const obj_val = self.pop();
                    defer release(self.allocator, obj_val);

                    switch (obj_val) {
                        .Array => |arr| {
                            if (idx_val != .Number) return self.runtimeError("Array index must be a number", .{});
                            const idx = @as(i64, @intFromFloat(idx_val.Number));
                            if (idx < 0 or idx >= arr.elements.items.len) {
                                return self.runtimeError("Array index out of bounds", .{});
                            }
                            self.push(arr.elements.items[@as(usize, @intCast(idx))]);
                        },
                        .Object => |obj| {
                            if (idx_val != .String) return self.runtimeError("Object index must be a string", .{});
                            if (obj.fields.get(idx_val.String.chars)) |val| {
                                self.push(val);
                            } else {
                                self.push(.Null);
                            }
                        },
                        else => return self.runtimeError("Index access on non-indexable type", .{}),
                    }
                },
                .SetIndex => {
                    const idx_val = self.pop();
                    defer release(self.allocator, idx_val);
                    const obj_val = self.pop();
                    defer release(self.allocator, obj_val);
                    const val = self.peek(0);

                    switch (obj_val) {
                        .Array => |arr| {
                            if (idx_val != .Number) return self.runtimeError("Array index must be a number", .{});
                            const idx = @as(i64, @intFromFloat(idx_val.Number));
                            if (idx < 0 or idx >= arr.elements.items.len) {
                                return self.runtimeError("Array index out of bounds", .{});
                            }
                            const old = arr.elements.items[@as(usize, @intCast(idx))];
                            arr.elements.items[@as(usize, @intCast(idx))] = val;
                            retain(val);
                            release(self.allocator, old);
                        },
                        .Object => |obj| {
                            if (idx_val != .String) return self.runtimeError("Object index must be a string", .{});
                            const name = idx_val.String.chars;
                            if (obj.fields.getEntry(name)) |entry| {
                                const old = entry.value_ptr.*;
                                entry.value_ptr.* = val;
                                retain(val);
                                release(self.allocator, old);
                            } else {
                                try obj.fields.put(try self.allocator.dupe(u8, name), val);
                                retain(val);
                            }
                        },
                        else => return self.runtimeError("Index assign on non-indexable type", .{}),
                    }
                },
                .ArrayLen => {
                    const arr_val = self.pop();
                    defer release(self.allocator, arr_val);
                    if (arr_val == .Array) {
                        self.push(Value{ .Number = @as(f64, @floatFromInt(arr_val.Array.elements.items.len)) });
                    } else return self.runtimeError("ArrayLen requires an Array", .{});
                },
                .MakeObject => {
                    const n = readU16(frame);
                    const obj = try allocObject(self.allocator);
                    errdefer release(self.allocator, Value{ .Object = obj });
                    try obj.fields.ensureTotalCapacity(n);

                    // Pop n key-value pairs (key, value) from stack
                    var i: usize = 0;
                    while (i < n) : (i += 1) {
                        const val = self.pop();
                        const key_val = self.pop();
                        
                        if (key_val != .String) {
                            release(self.allocator, val);
                            release(self.allocator, key_val);
                            return self.runtimeError("Object literal keys must be strings", .{});
                        }
                        
                        try obj.fields.put(try self.allocator.dupe(u8, key_val.String.chars), val);
                        release(self.allocator, key_val);
                        // value ownership transferred to object fields map
                    }
                    self.push(Value{ .Object = obj });
                    release(self.allocator, Value{ .Object = obj });
                },
                .GetField => {
                    const name_idx = readU16(frame);
                    const name_val = readConst(frame, name_idx);
                    const name = name_val.String.chars;
                    const obj_val = self.pop();
                    defer release(self.allocator, obj_val);

                    switch (obj_val) {
                        .Object => |obj| {
                            const ic_idx = (frame.ip +% name_idx) & 255;
                            const ic = &self.inline_caches[ic_idx];
                            if (ic.lookup(obj, name)) |cached_val| {
                                self.push(cached_val);
                            } else {
                                if (obj.fields.get(name)) |val| {
                                    ic.insert(obj, name, val);
                                    self.push(val);
                                } else {
                                    self.push(.Null);
                                }
                            }
                        },
                        .Array => |arr| {
                            // Check if standard array methods like push, pop, len are loaded
                            if (std.mem.eql(u8, name, "len") or std.mem.eql(u8, name, "length")) {
                                self.push(Value{ .Number = @as(f64, @floatFromInt(arr.elements.items.len)) });
                            } else {
                                // Resolve via standard array functions
                                if (self.array_module == null) {
                                    self.array_module = try stdlib.getArrayModule(self.allocator);
                                }
                                const stdArr = self.array_module.?;
                                if (stdArr.Object.fields.get(name)) |val| {
                                    if (val == .Native) {
                                        self.push(Value{ .BoundNative = .{ .target = @ptrCast(obj_val.Array), .is_array = true, .func = val.Native } });
                                    } else {
                                        self.push(val);
                                    }
                                } else {
                                    self.push(.Null);
                                }
                            }
                        },
                        .String => |s| {
                            if (std.mem.eql(u8, name, "len") or std.mem.eql(u8, name, "length")) {
                                self.push(Value{ .Number = @as(f64, @floatFromInt(s.chars.len)) });
                            } else {
                                if (self.string_module == null) {
                                    self.string_module = try stdlib.getStringModule(self.allocator);
                                }
                                const stdStr = self.string_module.?;
                                if (stdStr.Object.fields.get(name)) |val| {
                                    if (val == .Native) {
                                        self.push(Value{ .BoundNative = .{ .target = @ptrCast(obj_val.String), .is_array = false, .func = val.Native } });
                                    } else {
                                        self.push(val);
                                    }
                                } else {
                                    self.push(.Null);
                                }
                            }
                        },
                        else => return self.runtimeError("Property access on non-object type", .{}),
                    }
                },
                .SetField => {
                    const name_idx = readU16(frame);
                    const name_val = readConst(frame, name_idx);
                    const name = name_val.String.chars;
                    
                    const obj_val = self.pop();
                    defer release(self.allocator, obj_val);
                    const val = self.peek(0);

                    const ic_idx = (frame.ip +% name_idx) & 255;
                    self.inline_caches[ic_idx].invalidate();

                    switch (obj_val) {
                        .Object => |obj| {
                            if (obj.fields.getEntry(name)) |entry| {
                                const old = entry.value_ptr.*;
                                entry.value_ptr.* = val;
                                retain(val);
                                release(self.allocator, old);
                            } else {
                                try obj.fields.put(try self.allocator.dupe(u8, name), val);
                                retain(val);
                            }
                        },
                        else => return self.runtimeError("Property assignment on non-object type", .{}),
                    }
                },
                .MakeIter => {
                    const val = self.pop();
                    defer release(self.allocator, val);
                    const it = try allocIterator(self.allocator, val);
                    self.push(Value{ .Iterator = it });
                    release(self.allocator, Value{ .Iterator = it });
                },
                .IterNext => {
                    const offset = readI16(frame);
                    const it_val = self.peek(0);
                    if (it_val != .Iterator) return self.runtimeError("IterNext expects Iterator on stack", .{});
                    const it = it_val.Iterator;

                    switch (it.iterable) {
                        .Array => |arr| {
                            if (it.index < arr.elements.items.len) {
                                self.push(arr.elements.items[it.index]);
                                it.index += 1;
                            } else {
                                // Iterator depleted, jump to offset
                                if (offset < 0) {
                                    frame.ip -= @as(usize, @intCast(-offset));
                                } else {
                                    frame.ip += @as(usize, @intCast(offset));
                                }
                            }
                        },
                        else => return self.runtimeError("Iteration not supported for type", .{}),
                    }
                },
                .Concat => {
                    const n = readU16(frame);
                    
                    // Pop and collect parts
                    const parts = try self.allocator.alloc(Value, n);
                    defer self.allocator.free(parts);
                    
                    var i: usize = 0;
                    while (i < n) : (i += 1) {
                        parts[n - 1 - i] = self.pop();
                    }
                    defer {
                        for (parts) |p| release(self.allocator, p);
                    }

                    // Format each part into strings
                    var list = std.ArrayList([]const u8).empty;
                    defer {
                        for (list.items) |item| self.allocator.free(item);
                        list.deinit(self.allocator);
                    }

                    for (parts) |p| {
                        var temp = std.ArrayList(u8).empty;
                        defer temp.deinit(self.allocator);
                        var aw = std.Io.Writer.Allocating.fromArrayList(self.allocator, &temp);
                        try p.print(aw.writer);
                        temp = aw.toArrayList();
                        try list.append(self.allocator, try self.allocator.dupe(u8, temp.items));
                    }

                    const joined = try std.mem.concat(self.allocator, u8, list.items);
                    defer self.allocator.free(joined);

                    const str = try allocString(self.allocator, joined);
                    self.push(Value{ .String = str });
                    release(self.allocator, Value{ .String = str });
                },
                .LineInfo => {
                    _ = readU16(frame);
                },
                .Halt => return .Null,
            }
        }
    }

    fn valuesEqual(self: *VM, a: Value, b: Value) bool {
        _ = self;
        if (a == .Null and b == .Null) return true;
        if (a == .Boolean and b == .Boolean) return a.Boolean == b.Boolean;
        if (a == .Number and b == .Number) return a.Number == b.Number;
        if (a == .String and b == .String) return std.mem.eql(u8, a.String.chars, b.String.chars);
        return false;
    }

    fn doTailCall(self: *VM, frame: *CallFrame, argc: u8) void {
        const args_start = self.active_ctx.stack_top - argc;
        const callee_idx = args_start - 1;

        // 1. Release old locals from frame.base up to callee_idx (including callee)
        var idx = frame.base;
        while (idx <= callee_idx) : (idx += 1) {
            release(self.allocator, self.active_ctx.stack[idx]);
        }

        // 2. Move new arguments into frame.base .. frame.base + argc
        var i: usize = 0;
        while (i < argc) : (i += 1) {
            self.active_ctx.stack[frame.base + i] = self.active_ctx.stack[args_start + i];
        }

        // 3. Reset stack_top and instruction pointer
        self.active_ctx.stack_top = frame.base + argc;
        frame.ip = 0;
    }

    fn callValue(self: *VM, callee: Value, argc: u8) !void {
        switch (callee) {
            .Function => |func| {
                if (func.arity != argc) {
                    return self.runtimeError("Expected {} arguments, got {}", .{ func.arity, argc });
                }
                if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                    const args = self.active_ctx.stack[self.active_ctx.stack_top - argc .. self.active_ctx.stack_top];
                    profiler.global_profiler.recordInvocation(func.name, func.arity, args);
                }
                if (self.active_ctx.frame_count >= 256) {
                    return self.runtimeError("Stack overflow", .{});
                }
                self.active_ctx.frames[self.active_ctx.frame_count] = CallFrame{
                    .function = func,
                    .closure = null,
                    .ip = 0,
                    .base = self.active_ctx.stack_top - argc,
                };
                self.active_ctx.frame_count += 1;
            },
            .Closure => |cl| {
                if (cl.function.arity != argc) {
                    return self.runtimeError("Expected {} arguments, got {}", .{ cl.function.arity, argc });
                }
                if (main_mod.enable_profiler and profiler.is_profiler_initialized) {
                    const args = self.active_ctx.stack[self.active_ctx.stack_top - argc .. self.active_ctx.stack_top];
                    profiler.global_profiler.recordInvocation(cl.function.name, cl.function.arity, args);
                }
                if (self.active_ctx.frame_count >= 256) {
                    return self.runtimeError("Stack overflow", .{});
                }
                self.active_ctx.frames[self.active_ctx.frame_count] = CallFrame{
                    .function = cl.function,
                    .closure = cl,
                    .ip = 0,
                    .base = self.active_ctx.stack_top - argc,
                };
                self.active_ctx.frame_count += 1;
            },
            .Native => |native| {
                const args = self.active_ctx.stack[self.active_ctx.stack_top - argc .. self.active_ctx.stack_top];
                const res = native(self.allocator, args) catch |err| {
                    if (err == error.Yield) {
                        self.active_ctx.yielded_argc = argc;
                    }
                    return err;
                };
                
                retain(res);
                // Pop arguments and callee
                for (0..argc + 1) |_| {
                    const popped = self.pop();
                    release(self.allocator, popped);
                }
                
                self.push(res);
                release(self.allocator, res);
            },
            .BoundNative => |bn| {
                const target_val = if (bn.is_array) Value{ .Array = @as(*HkdArray, @alignCast(@ptrCast(bn.target))) } else Value{ .String = @as(*HkdString, @alignCast(@ptrCast(bn.target))) };
                var new_args_buf: [16]Value = undefined;
                var new_args: []Value = undefined;
                if (argc + 1 <= 16) {
                    new_args = new_args_buf[0 .. argc + 1];
                } else {
                    new_args = try self.allocator.alloc(Value, argc + 1);
                }
                defer {
                    if (argc + 1 > 16) {
                        self.allocator.free(new_args);
                    }
                }
                new_args[0] = target_val;
                @memcpy(new_args[1..], self.active_ctx.stack[self.active_ctx.stack_top - argc .. self.active_ctx.stack_top]);
                
                const res = bn.func(self.allocator, new_args) catch |err| {
                    if (err == error.Yield) {
                        self.active_ctx.yielded_argc = argc;
                    }
                    return err;
                };
                
                retain(res);
                // Pop arguments and callee
                for (0..argc + 1) |_| {
                    const popped = self.pop();
                    release(self.allocator, popped);
                }
                
                self.push(res);
                release(self.allocator, res);
            },
            else => return self.runtimeError("Value is not callable", .{}),
        }
    }

    // ─── Native built-ins registration ─────────────────────────────────────────

    fn registerBuiltins(self: *VM) !void {
        try self.defineNative("print", ioPrintNative);
        try self.defineNative("println", ioPrintNative);
        try self.defineNative("len", lenNative);
        try self.defineNative("to_string", toStringNative);
        try self.defineNative("to_bool", toBoolNative);
        try self.defineNative("to_int", toIntNative);
        try self.defineNative("to_float", toFloatNative);
        try self.defineNative("type_of", typeOfNative);
        try self.defineNative("exit", exitNative);
        try self.defineNative("range", rangeNative);
        try self.defineNative("panic", panicNative);
        try self.defineNative("assert", assertNative);
        try self.defineNative("__assert__", assertNative);
        try self.defineNative("__import__", importNative);
        try self.defineNative("__register_test__", registerTestNative);
        try self.defineNative("__hkd_future", hkdFutureNative);
        try self.defineNative("__hkd_is_pending", hkdIsPendingNative);
        try self.defineNative("__hkd_unwrap", hkdUnwrapNative);
        try self.defineNative("__hkd_resolve", hkdResolveNative);
        try self.defineNative("__hkd_reject", hkdRejectNative);
        try self.defineNative("__hkd_on_complete", hkdOnCompleteNative);
    }

    pub fn defineNative(self: *VM, name: []const u8, fn_ptr: value_mod.HkdNativeFn) !void {
        const key = try self.allocator.dupe(u8, name);
        try self.globals.put(key, Value{ .Native = fn_ptr });
    }
};

// ─── Global Native Implementations ───────────────────────────────────────────

fn ioPrintNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    var first = true;
    for (args) |arg| {
        if (!first) {
            try std.Io.File.stdout().writeStreamingAll(main_mod.global_io, " ");
        }
        first = false;
        var temp = std.ArrayList(u8).empty;
        defer temp.deinit(allocator);
        var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &temp);
        try arg.print(&aw.writer);
        temp = aw.toArrayList();
        try std.Io.File.stdout().writeStreamingAll(main_mod.global_io, temp.items);
    }
    try std.Io.File.stdout().writeStreamingAll(main_mod.global_io, "\n");
    return .Null;
}

fn lenNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Array => |arr| return Value{ .Number = @as(f64, @floatFromInt(arr.elements.items.len)) },
        .String => |s| return Value{ .Number = @as(f64, @floatFromInt(s.chars.len)) },
        .Object => |obj| return Value{ .Number = @as(f64, @floatFromInt(obj.fields.count())) },
        else => return .Null,
    }
}

fn toStringNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1) return .Null;
    var list = std.ArrayList(u8).empty;
    defer list.deinit(allocator);
    var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &list);
    try args[0].print(&aw.writer);
    list = aw.toArrayList();
    const str = try allocString(allocator, list.items);
    return Value{ .String = str };
}

fn toBoolNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return Value{ .Boolean = false };
    return Value{ .Boolean = args[0].isTruthy() };
}

fn exitNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    const code = if (args.len > 0 and args[0] == .Number) @as(u8, @intFromFloat(args[0].Number)) else @as(u8, 0);
    std.process.exit(code);
}

fn rangeNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 2) return .Null;
    const start = switch (args[0]) { .Number => |n| @as(i64, @intFromFloat(n)), else => 0 };
    const end = switch (args[1]) { .Number => |n| @as(i64, @intFromFloat(n)), else => 0 };
    
    const arr = try allocArray(allocator);
    errdefer release(allocator, Value{ .Array = arr });

    var i = start;
    while (i < end) : (i += 1) {
        try arr.elements.append(allocator, Value{ .Number = @as(f64, @floatFromInt(i)) });
    }

    return Value{ .Array = arr };
}

fn panicNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len > 0) {
        try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "Panic: ");
        var temp = std.ArrayList(u8).empty;
        defer temp.deinit(allocator);
        var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &temp);
        try args[0].print(&aw.writer);
        temp = aw.toArrayList();
        try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, temp.items);
        try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "\n");
    } else {
        try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "Panic!\n");
    }
    std.process.exit(1);
}

fn assertNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or !args[0].isTruthy()) {
        if (args.len > 1) {
            try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "Assertion failed: ");
            var temp = std.ArrayList(u8).empty;
            defer temp.deinit(allocator);
            var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &temp);
            try args[1].print(&aw.writer);
            temp = aw.toArrayList();
            try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, temp.items);
            try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "\n");
        } else {
            try std.Io.File.stderr().writeStreamingAll(main_mod.global_io, "Assertion failed\n");
        }
        std.process.exit(1);
    }
    return .Null;
}

fn toIntNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @trunc(n) },
        .String => |s| {
            const parsed = std.fmt.parseInt(i64, s.chars, 10) catch {
                const float_val = std.fmt.parseFloat(f64, s.chars) catch {
                    return error.RuntimeError;
                };
                return Value{ .Number = @trunc(float_val) };
            };
            return Value{ .Number = @as(f64, @floatFromInt(parsed)) };
        },
        .Boolean => |b| return Value{ .Number = if (b) 1.0 else 0.0 },
        else => return error.RuntimeError,
    }
}

fn toFloatNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = n },
        .String => |s| {
            const parsed = std.fmt.parseFloat(f64, s.chars) catch {
                return error.RuntimeError;
            };
            return Value{ .Number = parsed };
        },
        else => return error.RuntimeError,
    }
}

fn typeOfNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1) return .Null;
    const name = switch (args[0]) {
        .Null => "null",
        .Boolean => "Bool",
        .Number => |n| if (n == @trunc(n)) "Int" else "Float",
        .String => "String",
        .Array => "Array",
        .Object => "Object",
        .Function, .Closure, .Native, .BoundNative => "Function",
        else => "Object",
    };
    const str = try allocString(allocator, name);
    return Value{ .String = str };
}

fn registerTestNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    return .Null;
}

// ─── Module Resolution and Loading ──────────────────────────────────────────

fn importNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const module_path = args[0].String.chars;
    
    // 1. Check if it's a standard library module
    if (try stdlib.resolveStdModule(allocator, module_path)) |std_mod| {
        return std_mod;
    }

    // 2. Otherwise try loading it dynamically as .hkdb file
    // Wait, the deserializer logic in main.zig handles this. We will register a custom resolver in main.zig.
    // For now we will return Null if it is not stdlib (handled recursively).
    return .Null;
}

fn hkdFutureNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    const val = if (args.len > 0) args[0] else .Null;
    const isResolved = val != .Null;
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "__type__"), Value{ .String = try allocString(allocator, "Future") });
    try obj.fields.put(try allocator.dupe(u8, "state"), Value{ .String = try allocString(allocator, if (isResolved) "resolved" else "pending") });
    try obj.fields.put(try allocator.dupe(u8, "value"), val);
    try obj.fields.put(try allocator.dupe(u8, "error"), .Null);
    return Value{ .Object = obj };
}

fn hkdIsPendingNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1 or args[0] != .Object) return Value{ .Boolean = false };
    const obj = args[0].Object;
    if (obj.fields.get("state")) |st| {
        if (st == .String and std.mem.eql(u8, st.String.chars, "pending")) {
            return Value{ .Boolean = true };
        }
    }
    return Value{ .Boolean = false };
}

fn hkdUnwrapNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    if (args[0] == .Object) {
        const obj = args[0].Object;
        if (obj.fields.get("value")) |v| {
            return v;
        }
    }
    return args[0];
}

fn hkdResolveNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .Object) return if (args.len > 0) args[0] else .Null;
    const val = if (args.len > 1) args[1] else .Null;
    const obj = args[0].Object;
    if (obj.fields.get("state")) |st| {
        if (st == .String and !std.mem.eql(u8, st.String.chars, "pending")) {
            return args[0];
        }
    }
    try obj.fields.put(try allocator.dupe(u8, "state"), Value{ .String = try allocString(allocator, "resolved") });
    try obj.fields.put(try allocator.dupe(u8, "value"), val);
    return args[0];
}

fn hkdRejectNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .Object) return if (args.len > 0) args[0] else .Null;
    const errVal = if (args.len > 1) args[1] else .Null;
    const obj = args[0].Object;
    if (obj.fields.get("state")) |st| {
        if (st == .String and !std.mem.eql(u8, st.String.chars, "pending")) {
            return args[0];
        }
    }
    try obj.fields.put(try allocator.dupe(u8, "state"), Value{ .String = try allocString(allocator, "rejected") });
    try obj.fields.put(try allocator.dupe(u8, "error"), errVal);
    return args[0];
}

fn hkdOnCompleteNative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    return .Null;
}

test "Polymorphic Inline Cache transitions and bounds" {
    var ic = InlineCacheEntry{};
    try std.testing.expectEqual(CacheState.Uninitialized, ic.state);

    var dummy1 = value_mod.HkdObject{ .fields = std.StringHashMap(Value).init(std.testing.allocator) };
    defer dummy1.fields.deinit();
    var dummy2 = value_mod.HkdObject{ .fields = std.StringHashMap(Value).init(std.testing.allocator) };
    defer dummy2.fields.deinit();
    var dummy3 = value_mod.HkdObject{ .fields = std.StringHashMap(Value).init(std.testing.allocator) };
    defer dummy3.fields.deinit();
    var dummy4 = value_mod.HkdObject{ .fields = std.StringHashMap(Value).init(std.testing.allocator) };
    defer dummy4.fields.deinit();
    var dummy5 = value_mod.HkdObject{ .fields = std.StringHashMap(Value).init(std.testing.allocator) };
    defer dummy5.fields.deinit();

    // 1. Monomorphic
    ic.insert(&dummy1, "x", Value{ .Number = 10 });
    try std.testing.expectEqual(CacheState.Monomorphic, ic.state);
    try std.testing.expectEqual(Value{ .Number = 10 }, ic.lookup(&dummy1, "x").?);

    // 2. Polymorphic (2 shapes)
    ic.insert(&dummy2, "x", Value{ .Number = 20 });
    try std.testing.expectEqual(CacheState.Polymorphic, ic.state);
    try std.testing.expectEqual(Value{ .Number = 10 }, ic.lookup(&dummy1, "x").?);
    try std.testing.expectEqual(Value{ .Number = 20 }, ic.lookup(&dummy2, "x").?);

    // 3. Polymorphic (4 shapes)
    ic.insert(&dummy3, "x", Value{ .Number = 30 });
    ic.insert(&dummy4, "x", Value{ .Number = 40 });
    try std.testing.expectEqual(CacheState.Polymorphic, ic.state);
    try std.testing.expectEqual(Value{ .Number = 40 }, ic.lookup(&dummy4, "x").?);

    // 4. Megamorphic fallback (> 4 shapes)
    ic.insert(&dummy5, "x", Value{ .Number = 50 });
    try std.testing.expectEqual(CacheState.Megamorphic, ic.state);
    // In megamorphic state, lookup returns null (bypasses cache safely)
    try std.testing.expect(ic.lookup(&dummy5, "x") == null);

    // 5. Invalidation
    ic.invalidate();
    try std.testing.expectEqual(CacheState.Uninitialized, ic.state);
}
