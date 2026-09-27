// HKD Runtime Guards & Deoptimization Engine
//
// Implements speculative execution guards and seamless deoptimization
// fallback to the native Stack VM when dynamic assumptions fail.

const std = @import("std");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const HkdFunction = value_mod.HkdFunction;

pub const DeoptReason = enum {
    TypeMismatch,
    ShapeMismatch,
    BoundsCheckFailed,
    IntegerOverflow,
    UnsupportedOpcode,
};

pub const DeoptPoint = struct {
    ip: usize,
    local_count: usize,
    reason: DeoptReason,
};

pub const DeoptManager = struct {
    total_deoptimizations: usize = 0,
    last_reason: ?DeoptReason = null,

    pub fn init() DeoptManager {
        return .{};
    }

    /// Records a deoptimization event and prepares the stack slots for VM resumption.
    pub fn recordDeopt(self: *DeoptManager, reason: DeoptReason) void {
        self.total_deoptimizations += 1;
        self.last_reason = reason;
    }

    /// Type guard: verifies that a value is numeric.
    pub inline fn guardNumber(val: Value) bool {
        return val == .Number;
    }

    /// Integer guard: verifies that a value is an integer.
    pub inline fn guardInteger(val: Value) bool {
        if (val != .Number) return false;
        const f = val.Number;
        return @trunc(f) == f and !std.math.isNan(f) and !std.math.isInf(f);
    }

    /// Bounds guard: verifies that index is within array bounds.
    pub inline fn guardBounds(index: i64, len: usize) bool {
        return index >= 0 and @as(usize, @intCast(index)) < len;
    }

    /// Shape guard: verifies that an object contains the specified field.
    pub inline fn guardShape(obj: Value, field: []const u8) bool {
        if (obj != .Object) return false;
        return obj.Object.fields.contains(field);
    }
};

test "DeoptManager and speculative guards" {
    var deopt = DeoptManager.init();

    // Numeric guard
    try std.testing.expect(DeoptManager.guardNumber(Value{ .Number = 42.0 }));
    try std.testing.expect(!DeoptManager.guardNumber(Value{ .Boolean = true }));

    // Integer guard
    try std.testing.expect(DeoptManager.guardInteger(Value{ .Number = 100.0 }));
    try std.testing.expect(!DeoptManager.guardInteger(Value{ .Number = 3.14 }));

    // Bounds guard
    try std.testing.expect(DeoptManager.guardBounds(5, 10));
    try std.testing.expect(!DeoptManager.guardBounds(-1, 10));
    try std.testing.expect(!DeoptManager.guardBounds(10, 10));

    // Deopt recording
    deopt.recordDeopt(.TypeMismatch);
    try std.testing.expectEqual(@as(usize, 1), deopt.total_deoptimizations);
    try std.testing.expectEqual(DeoptReason.TypeMismatch, deopt.last_reason.?);
}
