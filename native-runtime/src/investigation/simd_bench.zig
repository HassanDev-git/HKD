const std = @import("std");

extern "kernel32" fn QueryPerformanceCounter(lpPerformanceCount: *i64) callconv(.winapi) c_int;
extern "kernel32" fn QueryPerformanceFrequency(lpFrequency: *i64) callconv(.winapi) c_int;

fn getTimestampNs() i64 {
    var count: i64 = 0;
    var freq: i64 = 0;
    _ = QueryPerformanceCounter(&count);
    _ = QueryPerformanceFrequency(&freq);
    return @divTrunc(count * 1_000_000_000, freq);
}

fn scalarSum(data: []const f64) f64 {
    var total: f64 = 0;
    for (data) |v| {
        total += v;
    }
    return total;
}

fn simdSum(data: []const f64) f64 {
    const VectorType = @Vector(4, f64);
    var total_vec: VectorType = @splat(0);
    const vec_len = data.len / 4;

    var i: usize = 0;
    while (i < vec_len) : (i += 1) {
        const chunk: *const [4]f64 = @ptrCast(data[i * 4 .. (i + 1) * 4].ptr);
        const v: VectorType = chunk.*;
        total_vec += v;
    }

    var total: f64 = @reduce(.Add, total_vec);
    for (data[vec_len * 4 ..]) |v| {
        total += v;
    }
    return total;
}

pub fn main() !void {
    const allocator = std.heap.smp_allocator;
    const count: usize = 1_000_000;
    const data = try allocator.alloc(f64, count);
    defer allocator.free(data);

    for (data, 0..) |*ptr, idx| {
        ptr.* = @as(f64, @floatFromInt(idx % 100)) * 0.1;
    }

    // Warmup
    _ = scalarSum(data);
    _ = simdSum(data);

    // Measure Scalar
    const iters: usize = 100;
    const start_scalar = getTimestampNs();
    var scalar_result: f64 = 0;
    for (0..iters) |_| {
        scalar_result += scalarSum(data);
    }
    const end_scalar = getTimestampNs();
    const scalar_duration_ms = @as(f64, @floatFromInt(end_scalar - start_scalar)) / 1_000_000.0;

    // Measure SIMD
    const start_simd = getTimestampNs();
    var simd_result: f64 = 0;
    for (0..iters) |_| {
        simd_result += simdSum(data);
    }
    const end_simd = getTimestampNs();
    const simd_duration_ms = @as(f64, @floatFromInt(end_simd - start_simd)) / 1_000_000.0;

    const speedup = scalar_duration_ms / simd_duration_ms;

    std.debug.print("=== SIMD Investigation Benchmark (1,000,000 f64 x 100 iters) ===\n", .{});
    std.debug.print("Scalar Time: {d:.2} ms (result: {d:.2})\n", .{ scalar_duration_ms, scalar_result });
    std.debug.print("SIMD Time:   {d:.2} ms (result: {d:.2})\n", .{ simd_duration_ms, simd_result });
    std.debug.print("SIMD Speedup: {d:.2}x\n", .{speedup});
}
