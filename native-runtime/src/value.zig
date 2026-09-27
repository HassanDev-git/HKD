const std = @import("std");

pub const ValueType = enum(u8) {
    Null     = 0x00,
    Boolean  = 0x01,
    Number   = 0x02,
    String   = 0x03,
    Array    = 0x04,
    Object   = 0x05,
    Function = 0x06,
    Closure  = 0x07,
    Iterator = 0x08,
    Native   = 0x09,
    BoundNative = 0x0A,
};

pub const HkdNativeFn = *const fn (allocator: std.mem.Allocator, args: []const Value) anyerror!Value;

pub const Value = union(ValueType) {
    Null: void,
    Boolean: bool,
    Number: f64,
    String: *HkdString,
    Array: *HkdArray,
    Object: *HkdObject,
    Function: *HkdFunction,
    Closure: *HkdClosure,
    Iterator: *HkdIterator,
    Native: HkdNativeFn,
    BoundNative: HkdBoundNative,

    pub fn print(self: Value, writer: anytype) !void {
        var w = writer;
        switch (self) {
            .Null => try w.writeAll("null"),
            .Boolean => |b| try w.print("{}", .{b}),
            .Number => |n| {
                // If it is integer, format as int, else as float
                if (!std.math.isNan(n) and !std.math.isInf(n) and n >= -9223372036854775808.0 and n <= 9223372036854775807.0 and n == @round(n)) {
                    try w.print("{d}", .{@as(i64, @intFromFloat(n))});
                } else {
                    try w.print("{d}", .{n});
                }
            },
            .String => |s| try w.writeAll(s.chars),
            .Array => |arr| {
                try w.writeAll("[");
                for (arr.elements.items, 0..) |el, i| {
                    if (i > 0) try w.writeAll(", ");
                    try el.print(w);
                }
                try w.writeAll("]");
            },
            .Object => |obj| {
                try w.writeAll("{");
                var it = obj.fields.iterator();
                var i: usize = 0;
                while (it.next()) |entry| {
                    if (i > 0) try w.writeAll(", ");
                    try w.print("\"{s}\": ", .{entry.key_ptr.*});
                    try entry.value_ptr.*.print(w);
                    i += 1;
                }
                try w.writeAll("}");
            },
            .Function => |f| try w.print("<fn {s}>", .{f.name}),
            .Closure => |c| try w.print("<fn {s}>", .{c.function.name}),
            .Iterator => try w.writeAll("<iterator>"),
            .Native => |n| try w.print("<native fn at {*}>", .{n}),
            .BoundNative => |bn| {
                const target_val = if (bn.is_array) Value{ .Array = @as(*HkdArray, @alignCast(@ptrCast(bn.target))) } else Value{ .String = @as(*HkdString, @alignCast(@ptrCast(bn.target))) };
                try w.print("<bound native fn on ", .{});
                try target_val.print(w);
                try w.print(">", .{});
            },
        }
    }

    pub fn isTruthy(self: Value) bool {
        return switch (self) {
            .Null => false,
            .Boolean => |b| b,
            .Number => |n| n != 0,
            .String => |s| s.chars.len > 0,
            else => true,
        };
    }
};

pub const HkdBoundNative = struct {
    target: *anyopaque,
    is_array: bool,
    func: HkdNativeFn,
};

pub const HkdString = struct {
    ref_count: usize,
    chars: []const u8,
};

pub const HkdArray = struct {
    ref_count: usize,
    elements: std.ArrayList(Value),
};

pub const HkdObject = struct {
    ref_count: usize,
    fields: std.StringHashMap(Value),
};

pub const HkdFunction = struct {
    name: []const u8,
    arity: u8,
    local_count: u16,
    upvalue_count: u16,
    code: []const u8,
    lines: []const u16,
    constants: []Value,
    call_count: usize = 0,
    native_fn: ?*const anyopaque = null,

    pub fn deinit(self: *HkdFunction, allocator: std.mem.Allocator) void {
        allocator.free(self.name);
        allocator.free(self.code);
        allocator.free(self.lines);
        for (self.constants) |val| {
            if (val == .Function) {
                val.Function.deinit(allocator);
            } else {
                release(allocator, val);
            }
        }
        allocator.free(self.constants);
        allocator.destroy(self);
    }
};

pub const Upvalue = struct {
    ref_count: usize,
    closed: bool,
    stack_index: usize, // If open, index in the Value Stack
    value: Value,       // If closed, holds the value directly
    next: ?*Upvalue = null,
};

pub const HkdClosure = struct {
    ref_count: usize,
    function: *HkdFunction,
    upvalues: []*Upvalue,
};

pub const HkdIterator = struct {
    ref_count: usize,
    iterable: Value,
    index: usize,
};

// ─── Allocators ─────────────────────────────────────────────────────────────

pub var empty_string_instance: HkdString = .{ .ref_count = 1000000000, .chars = "" };

const static_single_chars: [256][1]u8 = blk: {
    var arr: [256][1]u8 = undefined;
    for (0..256) |i| {
        arr[i][0] = @intCast(i);
    }
    break :blk arr;
};

pub var ascii_char_strings: [256]HkdString = blk: {
    var arr: [256]HkdString = undefined;
    for (0..256) |i| {
        arr[i] = .{ .ref_count = 1000000000, .chars = &static_single_chars[i] };
    }
    break :blk arr;
};

pub fn allocString(allocator: std.mem.Allocator, chars: []const u8) !*HkdString {
    if (chars.len == 0) {
        return &empty_string_instance;
    }
    if (chars.len == 1) {
        return &ascii_char_strings[chars[0]];
    }
    const s = try allocator.create(HkdString);
    s.* = .{
        .ref_count = 1,
        .chars = try allocator.dupe(u8, chars),
    };
    return s;
}

pub fn allocArray(allocator: std.mem.Allocator) !*HkdArray {
    const arr = try allocator.create(HkdArray);
    arr.* = .{
        .ref_count = 1,
        .elements = std.ArrayList(Value).empty,
    };
    return arr;
}

pub fn allocObject(allocator: std.mem.Allocator) !*HkdObject {
    const obj = try allocator.create(HkdObject);
    obj.* = .{
        .ref_count = 1,
        .fields = std.StringHashMap(Value).init(allocator),
    };
    return obj;
}


pub fn allocClosure(allocator: std.mem.Allocator, function: *HkdFunction, upvalues: []*Upvalue) !*HkdClosure {
    const cl = try allocator.create(HkdClosure);
    cl.* = .{
        .ref_count = 1,
        .function = function,
        .upvalues = upvalues,
    };
    return cl;
}

pub fn allocUpvalue(allocator: std.mem.Allocator, stack_index: usize) !*Upvalue {
    const uv = try allocator.create(Upvalue);
    uv.* = .{
        .ref_count = 1,
        .closed = false,
        .stack_index = stack_index,
        .value = .Null,
    };
    return uv;
}

pub fn allocIterator(allocator: std.mem.Allocator, iterable: Value) !*HkdIterator {
    const it = try allocator.create(HkdIterator);
    it.* = .{
        .ref_count = 1,
        .iterable = iterable,
        .index = 0,
    };
    retain(iterable);
    return it;
}

// ─── Retain / Release ────────────────────────────────────────────────────────

pub fn retain(val: Value) void {
    switch (val) {
        .String => |s| {
            if (s.ref_count >= 1000000000) return;
            s.ref_count += 1;
        },
        .Array => |arr| arr.ref_count += 1,
        .Object => |obj| obj.ref_count += 1,
        .Closure => |cl| cl.ref_count += 1,
        .Iterator => |it| it.ref_count += 1,
        .BoundNative => |bn| {
            const target_val = if (bn.is_array) Value{ .Array = @as(*HkdArray, @alignCast(@ptrCast(bn.target))) } else Value{ .String = @as(*HkdString, @alignCast(@ptrCast(bn.target))) };
            retain(target_val);
        },
        else => {},
    }
}

pub fn release(allocator: std.mem.Allocator, val: Value) void {
    switch (val) {
        .String => |s| {
            if (s.ref_count >= 1000000000) return;
            if (s.ref_count == 0) return;
            s.ref_count -= 1;
            if (s.ref_count == 0) {
                allocator.free(s.chars);
                allocator.destroy(s);
            }
        },
        .Array => |arr| {
            if (arr.ref_count == 0) return;
            arr.ref_count -= 1;
            if (arr.ref_count == 0) {
                for (arr.elements.items) |el| {
                    release(allocator, el);
                }
                arr.elements.deinit(allocator);
                allocator.destroy(arr);
            }
        },
        .Object => |obj| {
            if (obj.ref_count == 0) return;
            obj.ref_count -= 1;
            if (obj.ref_count == 0) {
                var it = obj.fields.iterator();
                while (it.next()) |entry| {
                    allocator.free(entry.key_ptr.*);
                    release(allocator, entry.value_ptr.*);
                }
                obj.fields.deinit();
                allocator.destroy(obj);
            }
        },
        .Closure => |cl| {
            if (cl.ref_count == 0) return;
            cl.ref_count -= 1;
            if (cl.ref_count == 0) {
                for (cl.upvalues) |uv| {
                    releaseUpvalue(allocator, uv);
                }
                allocator.free(cl.upvalues);
                allocator.destroy(cl);
            }
        },
        .Iterator => |it| {
            if (it.ref_count == 0) return;
            it.ref_count -= 1;
            if (it.ref_count == 0) {
                release(allocator, it.iterable);
                allocator.destroy(it);
            }
        },
        .BoundNative => |bn| {
            const target_val = if (bn.is_array) Value{ .Array = @as(*HkdArray, @alignCast(@ptrCast(bn.target))) } else Value{ .String = @as(*HkdString, @alignCast(@ptrCast(bn.target))) };
            release(allocator, target_val);
        },
        else => {},
    }
}

pub fn releaseUpvalue(allocator: std.mem.Allocator, uv: *Upvalue) void {
    if (uv.ref_count == 0) return;
    uv.ref_count -= 1;
    if (uv.ref_count == 0) {
        if (uv.closed) {
            release(allocator, uv.value);
        }
        allocator.destroy(uv);
    }
}
