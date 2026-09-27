// HKD Native Value Representation & Fast-Path Type System
//
// Bridges dynamic boxed Values with unboxed CPU registers (i64, f64, pointers).
// Emits type guards and routes execution between native fast paths and
// runtime slow paths.

const std = @import("std");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;

pub const NativeType = enum(u8) {
    Int64,
    Float64,
    Bool,
    Pointer,
    BoxedValue,
};

pub inline fn isInteger(val: Value) bool {
    if (val != .Number) return false;
    const f = val.Number;
    return @trunc(f) == f and !std.math.isNan(f) and !std.math.isInf(f);
}

pub inline fn asInt64(val: Value) ?i64 {
    if (val != .Number) return null;
    const f = val.Number;
    if (@trunc(f) != f or std.math.isNan(f) or std.math.isInf(f)) return null;
    return @as(i64, @intFromFloat(f));
}

pub inline fn asFloat64(val: Value) ?f64 {
    if (val != .Number) return null;
    return val.Number;
}

pub inline fn asBool(val: Value) ?bool {
    if (val != .Boolean) return null;
    return val.Boolean;
}

pub inline fn asPointer(val: Value) ?*anyopaque {
    return switch (val) {
        .String => |s| @ptrCast(s),
        .Array => |a| @ptrCast(a),
        .Object => |o| @ptrCast(o),
        .Function => |f| @ptrCast(f),
        .Closure => |c| @ptrCast(c),
        else => null,
    };
}

pub inline fn fromInt64(n: i64) Value {
    return Value{ .Number = @floatFromInt(n) };
}

pub inline fn fromFloat64(f: f64) Value {
    return Value{ .Number = f };
}

pub inline fn fromBool(b: bool) Value {
    return Value{ .Boolean = b };
}

// ─── Fast-Path Native Arithmetic (Guarded) ──────────────────────────────────

pub inline fn fastAdd(a: Value, b: Value) ?Value {
    if (a == .Number and b == .Number) {
        return Value{ .Number = a.Number + b.Number };
    }
    return null;
}

pub inline fn fastSub(a: Value, b: Value) ?Value {
    if (a == .Number and b == .Number) {
        return Value{ .Number = a.Number - b.Number };
    }
    return null;
}

pub inline fn fastMul(a: Value, b: Value) ?Value {
    if (a == .Number and b == .Number) {
        return Value{ .Number = a.Number * b.Number };
    }
    return null;
}

pub inline fn fastDiv(a: Value, b: Value) ?Value {
    if (a == .Number and b == .Number and b.Number != 0.0) {
        return Value{ .Number = a.Number / b.Number };
    }
    return null;
}

pub inline fn fastCmpLt(a: Value, b: Value) ?bool {
    if (a == .Number and b == .Number) {
        return a.Number < b.Number;
    }
    return null;
}

pub inline fn fastCmpLe(a: Value, b: Value) ?bool {
    if (a == .Number and b == .Number) {
        return a.Number <= b.Number;
    }
    return null;
}

pub inline fn fastCmpGt(a: Value, b: Value) ?bool {
    if (a == .Number and b == .Number) {
        return a.Number > b.Number;
    }
    return null;
}

pub inline fn fastCmpGe(a: Value, b: Value) ?bool {
    if (a == .Number and b == .Number) {
        return a.Number >= b.Number;
    }
    return null;
}

pub inline fn fastCmpEq(a: Value, b: Value) ?bool {
    if (a == .Null and b == .Null) return true;
    if (a == .Boolean and b == .Boolean) return a.Boolean == b.Boolean;
    if (a == .Number and b == .Number) return a.Number == b.Number;
    return null;
}

test "Native value unboxing and fast-paths" {
    const vInt = fromInt64(42);
    try std.testing.expect(isInteger(vInt));
    try std.testing.expectEqual(@as(i64, 42), asInt64(vInt).?);

    const vFloat = fromFloat64(3.14159);
    try std.testing.expect(!isInteger(vFloat));
    try std.testing.expectEqual(@as(f64, 3.14159), asFloat64(vFloat).?);

    const vBool = fromBool(true);
    try std.testing.expectEqual(true, asBool(vBool).?);

    const sum = fastAdd(vInt, fromInt64(8)).?;
    try std.testing.expectEqual(@as(i64, 50), asInt64(sum).?);

    const cmp = fastCmpLt(vInt, sum).?;
    try std.testing.expectEqual(true, cmp);
}
