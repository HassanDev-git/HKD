// HKD Production Runtime Profiler
//
// Collects low-overhead runtime telemetry:
// - Function invocation counts & execution time
// - Argument and return type distributions
// - Branch frequencies (taken vs not-taken)
// - Loop iteration and trip counts
// - Allocation metrics by size-class
// - Deoptimization counts and locations

const std = @import("std");
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const ValueType = value_mod.ValueType;

pub const TypeProfile = struct {
    type_counts: [16]usize = [_]usize{0} ** 16,

    pub fn record(self: *TypeProfile, val: Value) void {
        const tag: usize = @intFromEnum(val);
        if (tag < 16) {
            self.type_counts[tag] += 1;
        }
    }

    pub fn dominantType(self: *const TypeProfile) ?ValueType {
        var max_count: usize = 0;
        var best_tag: ?ValueType = null;
        for (self.type_counts, 0..) |cnt, idx| {
            if (cnt > max_count) {
                max_count = cnt;
                best_tag = @enumFromInt(@as(u8, @intCast(idx)));
            }
        }
        return best_tag;
    }
};

pub const FunctionProfile = struct {
    name: []const u8,
    invocations: usize = 0,
    total_time_ns: u64 = 0,
    arg_profiles: std.ArrayList(TypeProfile),
    return_profile: TypeProfile = .{},
    deopt_count: usize = 0,

    pub fn init(allocator: std.mem.Allocator, name: []const u8, arity: usize) FunctionProfile {
        var args = std.ArrayList(TypeProfile).initCapacity(allocator, arity) catch unreachable;
        var i: usize = 0;
        while (i < arity) : (i += 1) {
            args.appendAssumeCapacity(.{});
        }
        return .{
            .name = name,
            .arg_profiles = args,
        };
    }

    pub fn deinit(self: *FunctionProfile, allocator: std.mem.Allocator) void {
        self.arg_profiles.deinit(allocator);
    }
};

pub const BranchProfile = struct {
    taken: usize = 0,
    not_taken: usize = 0,

    pub fn ratio(self: BranchProfile) f64 {
        const total = self.taken + self.not_taken;
        if (total == 0) return 0.5;
        return @as(f64, @floatFromInt(self.taken)) / @as(f64, @floatFromInt(total));
    }
};

pub const PropertyProfile = struct {
    access_counts: std.StringHashMap(usize),

    pub fn init(allocator: std.mem.Allocator) PropertyProfile {
        return .{ .access_counts = std.StringHashMap(usize).init(allocator) };
    }

    pub fn record(self: *PropertyProfile, prop: []const u8) !void {
        const entry = try self.access_counts.getOrPut(prop);
        if (entry.found_existing) {
            entry.value_ptr.* += 1;
        } else {
            entry.value_ptr.* = 1;
        }
    }

    pub fn deinit(self: *PropertyProfile) void {
        self.access_counts.deinit();
    }
};

pub const LoopProfile = struct {
    loop_id: usize,
    iterations: usize = 0,
    trip_counts: usize = 0,
};

pub const AllocationProfile = struct {
    total_allocations: usize = 0,
    total_bytes: usize = 0,
    small_objects: usize = 0,
    small_arrays: usize = 0,
    small_strings: usize = 0,
};

pub const Profiler = struct {
    allocator: std.mem.Allocator,
    enabled: bool = false,
    output_path: ?[]const u8 = null,
    functions: std.StringHashMap(FunctionProfile),
    branches: std.AutoHashMap(usize, BranchProfile),
    properties: PropertyProfile,
    loops: std.AutoHashMap(usize, LoopProfile),
    allocations: AllocationProfile = .{},
    total_deopts: usize = 0,

    pub fn init(allocator: std.mem.Allocator) Profiler {
        return .{
            .allocator = allocator,
            .functions = std.StringHashMap(FunctionProfile).init(allocator),
            .branches = std.AutoHashMap(usize, BranchProfile).init(allocator),
            .properties = PropertyProfile.init(allocator),
            .loops = std.AutoHashMap(usize, LoopProfile).init(allocator),
        };
    }

    pub fn deinit(self: *Profiler) void {
        var it = self.functions.valueIterator();
        while (it.next()) |fp| {
            fp.deinit(self.allocator);
        }
        self.functions.deinit();
        self.branches.deinit();
        self.properties.deinit();
        self.loops.deinit();
    }

    pub fn recordInvocation(self: *Profiler, name: []const u8, arity: usize, args: []const Value) void {
        if (!self.enabled) return;
        var fp_entry = self.functions.getOrPut(name) catch return;
        if (!fp_entry.found_existing) {
            fp_entry.value_ptr.* = FunctionProfile.init(self.allocator, name, arity);
        }
        fp_entry.value_ptr.invocations += 1;
        for (args, 0..) |arg, i| {
            if (i < fp_entry.value_ptr.arg_profiles.items.len) {
                fp_entry.value_ptr.arg_profiles.items[i].record(arg);
            }
        }
    }

    pub fn recordReturn(self: *Profiler, name: []const u8, ret_val: Value) void {
        if (!self.enabled) return;
        if (self.functions.getPtr(name)) |fp| {
            fp.return_profile.record(ret_val);
        }
    }

    pub fn recordBranch(self: *Profiler, branch_id: usize, taken: bool) void {
        if (!self.enabled) return;
        var entry = self.branches.getOrPut(branch_id) catch return;
        if (!entry.found_existing) {
            entry.value_ptr.* = .{};
        }
        if (taken) {
            entry.value_ptr.taken += 1;
        } else {
            entry.value_ptr.not_taken += 1;
        }
    }

    pub fn recordLoop(self: *Profiler, loop_id: usize) void {
        if (!self.enabled) return;
        var entry = self.loops.getOrPut(loop_id) catch return;
        if (!entry.found_existing) {
            entry.value_ptr.* = .{ .loop_id = loop_id };
        }
        entry.value_ptr.iterations += 1;
    }

    pub fn recordAllocation(self: *Profiler, size: usize, kind: u8) void {
        if (!self.enabled) return;
        self.allocations.total_allocations += 1;
        self.allocations.total_bytes += size;
        if (kind == 0) self.allocations.small_objects += 1
        else if (kind == 1) self.allocations.small_arrays += 1
        else if (kind == 2) self.allocations.small_strings += 1;
    }

    pub fn recordDeopt(self: *Profiler, func_name: ?[]const u8) void {
        if (!self.enabled) return;
        self.total_deopts += 1;
        if (func_name) |name| {
            if (self.functions.getPtr(name)) |fp| {
                fp.deopt_count += 1;
            }
        }
    }

    /// Serializes collected profiling data to JSON.
    pub fn writeJson(self: *const Profiler, writer: anytype) !void {
        var w = writer;
        try w.writeAll("{\n  \"version\": 1,\n  \"total_deopts\": ");
        try w.print("{d},\n  \"allocations\": {{\n", .{self.total_deopts});
        try w.print("    \"total\": {d},\n    \"total_bytes\": {d},\n    \"small_objects\": {d},\n    \"small_arrays\": {d},\n    \"small_strings\": {d}\n  }},\n", .{
            self.allocations.total_allocations,
            self.allocations.total_bytes,
            self.allocations.small_objects,
            self.allocations.small_arrays,
            self.allocations.small_strings,
        });

        try w.writeAll("  \"functions\": {\n");
        var fn_it = self.functions.iterator();
        var first_fn = true;
        while (fn_it.next()) |entry| {
            if (!first_fn) try w.writeAll(",\n");
            first_fn = false;
            const fp = entry.value_ptr;
            try w.print("    \"{s}\": {{\n      \"invocations\": {d},\n      \"deopts\": {d},\n      \"args\": [", .{
                entry.key_ptr.*,
                fp.invocations,
                fp.deopt_count,
            });
            for (fp.arg_profiles.items, 0..) |ap, i| {
                if (i > 0) try w.writeAll(", ");
                const dom = ap.dominantType();
                if (dom) |d| {
                    try w.print("\"{s}\"", .{@tagName(d)});
                } else {
                    try w.writeAll("\"any\"");
                }
            }
            try w.writeAll("],\n      \"return_type\": ");
            if (fp.return_profile.dominantType()) |rt| {
                try w.print("\"{s}\"\n", .{@tagName(rt)});
            } else {
                try w.writeAll("\"any\"\n");
            }
            try w.writeAll("    }");
        }
        try w.writeAll("\n  }\n}\n");
    }
};

pub var global_profiler: Profiler = undefined;
pub var is_profiler_initialized: bool = false;

pub fn initGlobalProfiler(allocator: std.mem.Allocator) void {
    global_profiler = Profiler.init(allocator);
    is_profiler_initialized = true;
}

pub fn deinitGlobalProfiler() void {
    if (is_profiler_initialized) {
        global_profiler.deinit();
        is_profiler_initialized = false;
    }
}

pub const BufferWriter = struct {
    buf: []u8,
    pos: usize = 0,

    pub fn writeAll(self: *BufferWriter, bytes: []const u8) !void {
        if (self.pos + bytes.len > self.buf.len) return error.NoSpaceLeft;
        @memcpy(self.buf[self.pos..self.pos + bytes.len], bytes);
        self.pos += bytes.len;
    }

    pub fn print(self: *BufferWriter, comptime fmt: []const u8, args: anytype) !void {
        const slice = try std.fmt.bufPrint(self.buf[self.pos..], fmt, args);
        self.pos += slice.len;
    }

    pub fn getWritten(self: BufferWriter) []const u8 {
        return self.buf[0..self.pos];
    }
};

test "Profiler recording and JSON emission" {
    const allocator = std.testing.allocator;
    var profiler = Profiler.init(allocator);
    defer profiler.deinit();

    profiler.enabled = true;

    const args = [_]Value{
        Value{ .Number = 42 },
        Value{ .Boolean = true },
    };
    profiler.recordInvocation("add", 2, &args);
    profiler.recordReturn("add", Value{ .Number = 84 });
    profiler.recordBranch(1, true);
    profiler.recordLoop(10);
    profiler.recordAllocation(64, 0);

    var buf: [4096]u8 = undefined;
    var bw = BufferWriter{ .buf = &buf };

    try profiler.writeJson(&bw);

    const written = bw.getWritten();
    try std.testing.expect(written.len > 0);
    try std.testing.expect(std.mem.indexOf(u8, written, "\"add\":") != null);
    try std.testing.expect(std.mem.indexOf(u8, written, "\"Number\"") != null);
}
