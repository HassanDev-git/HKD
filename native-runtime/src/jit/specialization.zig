// HKD Runtime Type Specialization Engine
//
// Manages function specialization variants (Int, Float, Generic)
// with specialization budgets to bound code cache expansion.

const std = @import("std");
const builtin = @import("builtin");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const ValueType = value_mod.ValueType;
const x86_mod = @import("x86_64.zig");
const X86_64Emitter = x86_mod.X86_64Emitter;
const ExecutableBuffer = x86_mod.ExecutableBuffer;

pub const SpecializationKind = enum(u8) {
    Generic = 0,
    IntInt = 1,
    FloatFloat = 2,
};

pub const SpecializedVariant = struct {
    kind: SpecializationKind,
    exec_buf: ExecutableBuffer,
    native_fn_ptr: *const anyopaque,

    pub fn deinit(self: *SpecializedVariant) void {
        self.exec_buf.deinit();
    }
};

pub const SpecializationBudget = struct {
    max_variants_per_fn: usize = 2,
    max_total_specialized: usize = 64,
    current_specialized: usize = 0,

    pub fn canSpecialize(self: *const SpecializationBudget, current_fn_variants: usize) bool {
        return current_fn_variants < self.max_variants_per_fn and self.current_specialized < self.max_total_specialized;
    }
};

pub const SpecializationManager = struct {
    allocator: std.mem.Allocator,
    budget: SpecializationBudget = .{},
    variants: std.AutoHashMap(usize, std.ArrayList(SpecializedVariant)),

    pub fn init(allocator: std.mem.Allocator) SpecializationManager {
        return .{
            .allocator = allocator,
            .variants = std.AutoHashMap(usize, std.ArrayList(SpecializedVariant)).init(allocator),
        };
    }

    pub fn deinit(self: *SpecializationManager) void {
        var it = self.variants.valueIterator();
        while (it.next()) |var_list| {
            for (var_list.items) |*v| {
                v.deinit();
            }
            var_list.deinit(self.allocator);
        }
        self.variants.deinit();
    }

    /// Attempts to compile and register an Int-specialized binary function.
    pub fn compileIntSpecialization(self: *SpecializationManager, fn_id: usize) !?*const anyopaque {
        if (comptime builtin.cpu.arch != .x86_64) return null;

        var list_entry = try self.variants.getOrPut(fn_id);
        if (!list_entry.found_existing) {
            list_entry.value_ptr.* = std.ArrayList(SpecializedVariant).empty;
        }

        if (!self.budget.canSpecialize(list_entry.value_ptr.items.len)) {
            return null;
        }

        // Check if IntInt already compiled
        for (list_entry.value_ptr.items) |v| {
            if (v.kind == .IntInt) return v.native_fn_ptr;
        }

        var emitter = X86_64Emitter.init(self.allocator);
        defer emitter.deinit();

        try emitter.emitPrologue(32);
        if (comptime builtin.os.tag == .windows) {
            try emitter.emitMovReg(.RAX, .RCX);
            try emitter.emitAddReg(.RAX, .RDX);
        } else {
            try emitter.emitMovReg(.RAX, .RDI);
            try emitter.emitAddReg(.RAX, .RSI);
        }
        try emitter.emitEpilogue();

        var exec_buf = try ExecutableBuffer.init(emitter.code.items.len);
        errdefer exec_buf.deinit();

        try exec_buf.write(emitter.code.items);
        try exec_buf.protectExecutable();

        const fn_ptr: *const anyopaque = @ptrCast(exec_buf.ptr);
        try list_entry.value_ptr.append(self.allocator, .{
            .kind = .IntInt,
            .exec_buf = exec_buf,
            .native_fn_ptr = fn_ptr,
        });

        self.budget.current_specialized += 1;
        return fn_ptr;
    }

    /// Looks up a specialized variant for a function given observed argument types.
    pub fn getSpecialized(self: *const SpecializationManager, fn_id: usize, kind: SpecializationKind) ?*const anyopaque {
        const var_list = self.variants.get(fn_id) orelse return null;
        for (var_list.items) |v| {
            if (v.kind == kind) return v.native_fn_ptr;
        }
        return null;
    }
};

test "Specialization manager with budget" {
    const allocator = std.testing.allocator;
    var spec_mgr = SpecializationManager.init(allocator);
    defer spec_mgr.deinit();

    const fn_id: usize = 0x12345678;
    const fn_ptr = try spec_mgr.compileIntSpecialization(fn_id);
    try std.testing.expect(fn_ptr != null);

    const looked_up = spec_mgr.getSpecialized(fn_id, .IntInt);
    try std.testing.expect(looked_up != null);
    try std.testing.expectEqual(fn_ptr.?, looked_up.?);

    if (comptime builtin.cpu.arch == .x86_64) {
        const NativeAddFn = *const fn (i64, i64) callconv(.c) i64;
        const add_fn: NativeAddFn = @ptrCast(@alignCast(looked_up.?));
        const res = add_fn(25, 17);
        try std.testing.expectEqual(@as(i64, 42), res);
    }
}
