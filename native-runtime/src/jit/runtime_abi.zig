// HKD Native Runtime ABI
//
// Defines the stable internal C-callable interface between JIT-generated
// machine code and the native HKD runtime. Handles memory allocations,
// reference counting, complex dynamic property/array accesses, and string operations.

const std = @import("std");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const HkdString = value_mod.HkdString;
const HkdArray = value_mod.HkdArray;
const HkdObject = value_mod.HkdObject;
const allocString = value_mod.allocString;
const allocArray = value_mod.allocArray;
const allocObject = value_mod.allocObject;
const retain = value_mod.retain;
const release = value_mod.release;

pub const RUNTIME_ABI_VERSION: u32 = 1;

var global_allocator: std.mem.Allocator = undefined;
var is_initialized: bool = false;

pub fn init(allocator: std.mem.Allocator) void {
    global_allocator = allocator;
    is_initialized = true;
}

// ─── Exported C-Callable ABI ────────────────────────────────────────────────

pub export fn hkd_abi_version() callconv(.c) u32 {
    return RUNTIME_ABI_VERSION;
}

pub export fn hkd_runtime_alloc(size: usize) callconv(.c) ?*anyopaque {
    if (!is_initialized) return null;
    const slice = global_allocator.alloc(u8, size) catch return null;
    return slice.ptr;
}

pub export fn hkd_runtime_free(ptr: *anyopaque, size: usize) callconv(.c) void {
    if (!is_initialized) return;
    const slice: []u8 = @as([*]u8, @ptrCast(ptr))[0..size];
    global_allocator.free(slice);
}

pub export fn hkd_runtime_retain(val: *const Value) callconv(.c) void {
    retain(val.*);
}

pub export fn hkd_runtime_release(val: *const Value) callconv(.c) void {
    if (!is_initialized) return;
    release(global_allocator, val.*);
}

pub export fn hkd_runtime_get_field(out: *Value, obj: *const Value, field_ptr: [*]const u8, field_len: usize) callconv(.c) void {
    if (obj.* != .Object) {
        out.* = .Null;
        return;
    }
    const key = field_ptr[0..field_len];
    if (obj.Object.fields.get(key)) |val| {
        retain(val);
        out.* = val;
        return;
    }
    out.* = .Null;
}

pub export fn hkd_runtime_set_field(obj: *const Value, field_ptr: [*]const u8, field_len: usize, val: *const Value) callconv(.c) void {
    if (!is_initialized or obj.* != .Object) return;
    const key = field_ptr[0..field_len];
    if (obj.Object.fields.getEntry(key)) |entry| {
        const old = entry.value_ptr.*;
        entry.value_ptr.* = val.*;
        retain(val.*);
        release(global_allocator, old);
    } else {
        const duped_key = global_allocator.dupe(u8, key) catch return;
        obj.Object.fields.put(duped_key, val.*) catch return;
        retain(val.*);
    }
}

pub export fn hkd_runtime_array_get(out: *Value, arr: *const Value, index: i64) callconv(.c) void {
    if (arr.* != .Array or index < 0) {
        out.* = .Null;
        return;
    }
    const uidx: usize = @intCast(index);
    if (uidx >= arr.Array.elements.items.len) {
        out.* = .Null;
        return;
    }
    const val = arr.Array.elements.items[uidx];
    retain(val);
    out.* = val;
}

pub export fn hkd_runtime_array_set(arr: *const Value, index: i64, val: *const Value) callconv(.c) void {
    if (!is_initialized or arr.* != .Array or index < 0) return;
    const uidx: usize = @intCast(index);
    if (uidx >= arr.Array.elements.items.len) return;
    const old = arr.Array.elements.items[uidx];
    arr.Array.elements.items[uidx] = val.*;
    retain(val.*);
    release(global_allocator, old);
}

pub export fn hkd_runtime_array_push(arr: *const Value, val: *const Value) callconv(.c) void {
    if (!is_initialized or arr.* != .Array) return;
    arr.Array.elements.append(global_allocator, val.*) catch return;
    retain(val.*);
}

pub export fn hkd_runtime_string_concat(out: *Value, a: *const Value, b: *const Value) callconv(.c) void {
    if (!is_initialized or a.* != .String or b.* != .String) {
        out.* = .Null;
        return;
    }
    const s1 = a.String.chars;
    const s2 = b.String.chars;
    const combined = std.mem.concat(global_allocator, u8, &[_][]const u8{ s1, s2 }) catch {
        out.* = .Null;
        return;
    };
    defer global_allocator.free(combined);
    const new_str = allocString(global_allocator, combined) catch {
        out.* = .Null;
        return;
    };
    out.* = Value{ .String = new_str };
}

pub export fn hkd_runtime_string_len(val: *const Value) callconv(.c) i64 {
    if (val.* != .String) return -1;
    return @intCast(val.String.chars.len);
}

pub export fn hkd_runtime_string_eq(a: *const Value, b: *const Value) callconv(.c) bool {
    if (a.* != .String or b.* != .String) return false;
    if (a.String == b.String) return true;
    return std.mem.eql(u8, a.String.chars, b.String.chars);
}

pub export fn hkd_runtime_string_slice(out: *Value, val: *const Value, start: i64, end: i64) callconv(.c) void {
    if (!is_initialized or val.* != .String) {
        out.* = .Null;
        return;
    }
    const len: i64 = @intCast(val.String.chars.len);
    const actual_start: usize = @intCast(std.math.clamp(start, 0, len));
    const actual_end: usize = @intCast(std.math.clamp(end, start, len));
    if (actual_start >= actual_end) {
        const empty_str = allocString(global_allocator, "") catch {
            out.* = .Null;
            return;
        };
        out.* = Value{ .String = empty_str };
        return;
    }
    const slice = val.String.chars[actual_start..actual_end];
    const new_str = allocString(global_allocator, slice) catch {
        out.* = .Null;
        return;
    };
    out.* = Value{ .String = new_str };
}

pub export fn hkd_runtime_shape_check(obj: *const Value, expected_field_count: usize) callconv(.c) bool {
    if (obj.* != .Object) return false;
    return obj.Object.fields.count() == expected_field_count;
}

// ─── Direct Function Pointer Table ──────────────────────────────────────────

pub const RuntimeABITable = struct {
    abi_version: *const fn () callconv(.c) u32 = hkd_abi_version,
    alloc: *const fn (usize) callconv(.c) ?*anyopaque = hkd_runtime_alloc,
    free: *const fn (*anyopaque, usize) callconv(.c) void = hkd_runtime_free,
    retain: *const fn (*const Value) callconv(.c) void = hkd_runtime_retain,
    release: *const fn (*const Value) callconv(.c) void = hkd_runtime_release,
    get_field: *const fn (*Value, *const Value, [*]const u8, usize) callconv(.c) void = hkd_runtime_get_field,
    set_field: *const fn (*const Value, [*]const u8, usize, *const Value) callconv(.c) void = hkd_runtime_set_field,
    array_get: *const fn (*Value, *const Value, i64) callconv(.c) void = hkd_runtime_array_get,
    array_set: *const fn (*const Value, i64, *const Value) callconv(.c) void = hkd_runtime_array_set,
    array_push: *const fn (*const Value, *const Value) callconv(.c) void = hkd_runtime_array_push,
    string_concat: *const fn (*Value, *const Value, *const Value) callconv(.c) void = hkd_runtime_string_concat,
    string_len: *const fn (*const Value) callconv(.c) i64 = hkd_runtime_string_len,
    string_eq: *const fn (*const Value, *const Value) callconv(.c) bool = hkd_runtime_string_eq,
    string_slice: *const fn (*Value, *const Value, i64, i64) callconv(.c) void = hkd_runtime_string_slice,
    shape_check: *const fn (*const Value, usize) callconv(.c) bool = hkd_runtime_shape_check,
};

pub const global_table = RuntimeABITable{};

test "Runtime ABI verification" {
    const allocator = std.testing.allocator;
    init(allocator);

    try std.testing.expectEqual(@as(u32, 1), hkd_abi_version());

    const mem = hkd_runtime_alloc(64);
    try std.testing.expect(mem != null);
    hkd_runtime_free(mem.?, 64);

    const s1 = try allocString(allocator, "Hello, ");
    const s2 = try allocString(allocator, "JIT!");
    const v1 = Value{ .String = s1 };
    const v2 = Value{ .String = s2 };
    var concat_val: Value = undefined;
    hkd_runtime_string_concat(&concat_val, &v1, &v2);

    try std.testing.expect(concat_val == .String);
    try std.testing.expectEqualStrings("Hello, JIT!", concat_val.String.chars);
    try std.testing.expectEqual(@as(i64, 11), hkd_runtime_string_len(&concat_val));
    try std.testing.expect(hkd_runtime_string_eq(&concat_val, &concat_val));

    var slice_val: Value = undefined;
    hkd_runtime_string_slice(&slice_val, &concat_val, 7, 10);
    try std.testing.expectEqualStrings("JIT", slice_val.String.chars);

    hkd_runtime_release(&v1);
    hkd_runtime_release(&v2);
    hkd_runtime_release(&concat_val);
    hkd_runtime_release(&slice_val);
}
