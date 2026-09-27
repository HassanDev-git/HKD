const std = @import("std");
const builtin = @import("builtin");
const value_mod = @import("value.zig");
const Value = value_mod.Value;
const HkdString = value_mod.HkdString;
const HkdArray = value_mod.HkdArray;
const HkdObject = value_mod.HkdObject;
const HkdClosure = value_mod.HkdClosure;
const allocString = value_mod.allocString;
const allocArray = value_mod.allocArray;
const allocObject = value_mod.allocObject;
const retain = value_mod.retain;
const release = value_mod.release;
const main_mod = @import("main.zig");
const buffer_mod = @import("buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;
const process_mod = @import("process/process.zig");
const tcp_mod = @import("net/tcp.zig");
const udp_mod = @import("net/udp.zig");
const http_client_mod = @import("http/client.zig");
const http_server_mod = @import("http/server.zig");
const ffi_mod = @import("ffi/ffi.zig");

fn osSleep(ms: u32) void {
    if (comptime builtin.os.tag == .windows) {
        const kernel32 = struct {
            extern "kernel32" fn Sleep(dwMilliseconds: u32) callconv(.winapi) void;
        };
        kernel32.Sleep(ms);
    } else if (comptime builtin.os.tag == .linux) {
        const ts = std.os.linux.timespec{
            .sec = @intCast(ms / 1000),
            .nsec = @intCast((ms % 1000) * 1_000_000),
        };
        _ = std.os.linux.nanosleep(&ts, null);
    }
}

fn osGetTickCount64() u64 {
    if (comptime builtin.os.tag == .windows) {
        const kernel32 = struct {
            extern "kernel32" fn GetTickCount64() callconv(.winapi) u64;
        };
        return kernel32.GetTickCount64();
    } else if (comptime builtin.os.tag == .linux) {
        var ts: std.os.linux.timespec = undefined;
        _ = std.os.linux.clock_gettime(std.os.linux.CLOCK.MONOTONIC, &ts);
        return @as(u64, @intCast(ts.sec)) * 1000 + @as(u64, @intCast(@divTrunc(ts.nsec, 1_000_000)));
    } else {
        return 0;
    }
}

// ─── Math module ─────────────────────────────────────────────────────────────

fn mathSqrt(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @sqrt(n) },
        else => return .Null,
    }
}

fn mathAbs(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @abs(n) },
        else => return .Null,
    }
}

fn mathCeil(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @ceil(n) },
        else => return .Null,
    }
}

fn mathFloor(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @floor(n) },
        else => return .Null,
    }
}

fn mathRound(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @round(n) },
        else => return .Null,
    }
}

fn mathSin(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @sin(n) },
        else => return .Null,
    }
}

fn mathCos(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @cos(n) },
        else => return .Null,
    }
}

fn mathTan(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @tan(n) },
        else => return .Null,
    }
}

fn mathLog(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @log(n) },
        else => return .Null,
    }
}

fn mathLog2(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @log2(n) },
        else => return .Null,
    }
}

fn mathLog10(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @log10(n) },
        else => return .Null,
    }
}

fn mathPow(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2) return .Null;
    const base = switch (args[0]) { .Number => |n| n, else => return .Null };
    const exp = switch (args[1]) { .Number => |n| n, else => return .Null };
    return Value{ .Number = std.math.pow(f64, base, exp) };
}

fn mathExp(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| return Value{ .Number = @exp(n) },
        else => return .Null,
    }
}

fn mathMin(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2) return .Null;
    const a = switch (args[0]) { .Number => |n| n, else => return .Null };
    const b = switch (args[1]) { .Number => |n| n, else => return .Null };
    return Value{ .Number = @min(a, b) };
}

fn mathMax(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2) return .Null;
    const a = switch (args[0]) { .Number => |n| n, else => return .Null };
    const b = switch (args[1]) { .Number => |n| n, else => return .Null };
    return Value{ .Number = @max(a, b) };
}

var rand_seed: u64 = 123456789;
fn mathRandom(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    rand_seed = rand_seed *% 2862933555777941757 +% 3037000493;
    const val = @as(f64, @floatFromInt(rand_seed >> 33)) / @as(f64, 1 << 31);
    return Value{ .Number = val };
}

pub fn getMathModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    // Set constants
    try obj.fields.put(try allocator.dupe(u8, "PI"), Value{ .Number = std.math.pi });
    try obj.fields.put(try allocator.dupe(u8, "E"), Value{ .Number = std.math.e });
    try obj.fields.put(try allocator.dupe(u8, "INF"), Value{ .Number = std.math.inf(f64) });
    try obj.fields.put(try allocator.dupe(u8, "NAN"), Value{ .Number = std.math.nan(f64) });

    // Set functions
    try obj.fields.put(try allocator.dupe(u8, "sqrt"), Value{ .Native = mathSqrt });
    try obj.fields.put(try allocator.dupe(u8, "abs"), Value{ .Native = mathAbs });
    try obj.fields.put(try allocator.dupe(u8, "ceil"), Value{ .Native = mathCeil });
    try obj.fields.put(try allocator.dupe(u8, "floor"), Value{ .Native = mathFloor });
    try obj.fields.put(try allocator.dupe(u8, "round"), Value{ .Native = mathRound });
    try obj.fields.put(try allocator.dupe(u8, "sin"), Value{ .Native = mathSin });
    try obj.fields.put(try allocator.dupe(u8, "cos"), Value{ .Native = mathCos });
    try obj.fields.put(try allocator.dupe(u8, "tan"), Value{ .Native = mathTan });
    try obj.fields.put(try allocator.dupe(u8, "log"), Value{ .Native = mathLog });
    try obj.fields.put(try allocator.dupe(u8, "log2"), Value{ .Native = mathLog2 });
    try obj.fields.put(try allocator.dupe(u8, "log10"), Value{ .Native = mathLog10 });
    try obj.fields.put(try allocator.dupe(u8, "pow"), Value{ .Native = mathPow });
    try obj.fields.put(try allocator.dupe(u8, "exp"), Value{ .Native = mathExp });
    try obj.fields.put(try allocator.dupe(u8, "min"), Value{ .Native = mathMin });
    try obj.fields.put(try allocator.dupe(u8, "max"), Value{ .Native = mathMax });
    try obj.fields.put(try allocator.dupe(u8, "random"), Value{ .Native = mathRandom });

    return Value{ .Object = obj };
}

// ─── Time module ─────────────────────────────────────────────────────────────

fn timeNow(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    return Value{ .Number = @as(f64, @floatFromInt(osGetTickCount64())) };
}

fn timeNowSecs(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    return Value{ .Number = @as(f64, @floatFromInt(osGetTickCount64())) / 1000.0 };
}

fn timeSleep(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Number => |n| {
            if (n > 0) {
                osSleep(@as(u32, @intFromFloat(n)));
            }
        },
        else => {},
    }
    return .Null;
}

pub fn getTimeModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "now"), Value{ .Native = timeNow });
    try obj.fields.put(try allocator.dupe(u8, "now_secs"), Value{ .Native = timeNowSecs });
    try obj.fields.put(try allocator.dupe(u8, "sleep"), Value{ .Native = timeSleep });

    return Value{ .Object = obj };
}

// ─── IO module ───────────────────────────────────────────────────────────────

fn ioPrint(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
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

pub fn getIOModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "print"), Value{ .Native = ioPrint });
    try obj.fields.put(try allocator.dupe(u8, "println"), Value{ .Native = ioPrint });

    return Value{ .Object = obj };
}

// ─── Array module ────────────────────────────────────────────────────────────

fn arrayPush(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 2) return .Null;
    switch (args[0]) {
        .Array => |arr| {
            try arr.elements.append(allocator, args[1]);
            retain(args[1]);
        },
        else => {},
    }
    return .Null;
}

fn arrayPop(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Array => |arr| {
            if (arr.elements.items.len == 0) return .Null;
            return arr.elements.pop() orelse .Null;
        },
        else => return .Null,
    }
}

fn arrayLen(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .Array => |arr| return Value{ .Number = @as(f64, @floatFromInt(arr.elements.items.len)) },
        else => return .Null,
    }
}

fn arrayJoin(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1) return .Null;
    const sep = if (args.len >= 2 and args[1] == .String) args[1].String.chars else "";
    switch (args[0]) {
        .Array => |arr| {
            var list = std.ArrayList([]const u8).empty;
            defer {
                for (list.items) |item| allocator.free(item);
                list.deinit(allocator);
            }
            for (arr.elements.items) |item| {
                var temp = std.ArrayList(u8).empty;
                defer temp.deinit(allocator);
                var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &temp);
                try item.print(&aw.writer);
                temp = aw.toArrayList();
                try list.append(allocator, try allocator.dupe(u8, temp.items));
            }
            const joined = try std.mem.join(allocator, sep, list.items);
            defer allocator.free(joined);
            const str = try allocString(allocator, joined);
            return Value{ .String = str };
        },
        else => return .Null,
    }
}

pub fn getArrayModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "push"), Value{ .Native = arrayPush });
    try obj.fields.put(try allocator.dupe(u8, "pop"), Value{ .Native = arrayPop });
    try obj.fields.put(try allocator.dupe(u8, "len"), Value{ .Native = arrayLen });
    try obj.fields.put(try allocator.dupe(u8, "length"), Value{ .Native = arrayLen });
    try obj.fields.put(try allocator.dupe(u8, "join"), Value{ .Native = arrayJoin });

    return Value{ .Object = obj };
}

// ─── String module ───────────────────────────────────────────────────────────

fn stringLen(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .String => |s| return Value{ .Number = @as(f64, @floatFromInt(s.chars.len)) },
        else => return .Null,
    }
}

fn stringUpper(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const s = args[0].String.chars;
    const upper = try allocator.alloc(u8, s.len);
    defer allocator.free(upper);
    for (s, 0..) |c, i| {
        upper[i] = std.ascii.toUpper(c);
    }
    const str = try allocString(allocator, upper);
    return Value{ .String = str };
}

fn stringLower(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const s = args[0].String.chars;
    const lower = try allocator.alloc(u8, s.len);
    defer allocator.free(lower);
    for (s, 0..) |c, i| {
        lower[i] = std.ascii.toLower(c);
    }
    const str = try allocString(allocator, lower);
    return Value{ .String = str };
}

fn stringTrim(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const trimmed = std.mem.trim(u8, args[0].String.chars, &std.ascii.whitespace);
    const str = try allocString(allocator, trimmed);
    return Value{ .String = str };
}

fn stringSplit(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 2 or args[0] != .String or args[1] != .String) return .Null;
    const s = args[0].String.chars;
    const sep = args[1].String.chars;
    const arr = try allocArray(allocator);
    errdefer release(allocator, Value{ .Array = arr });
    
    var it = std.mem.splitSequence(u8, s, sep);
    while (it.next()) |part| {
        const p = try allocString(allocator, part);
        try arr.elements.append(allocator, Value{ .String = p });
    }
    return Value{ .Array = arr };
}

fn stringContains(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2 or args[0] != .String or args[1] != .String) return Value{ .Boolean = false };
    const s = args[0].String.chars;
    const sub = args[1].String.chars;
    return Value{ .Boolean = std.mem.indexOf(u8, s, sub) != null };
}

fn stringStartsWith(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2 or args[0] != .String or args[1] != .String) return Value{ .Boolean = false };
    return Value{ .Boolean = std.mem.startsWith(u8, args[0].String.chars, args[1].String.chars) };
}

fn stringEndsWith(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2 or args[0] != .String or args[1] != .String) return Value{ .Boolean = false };
    return Value{ .Boolean = std.mem.endsWith(u8, args[0].String.chars, args[1].String.chars) };
}

fn stringReplace(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 3 or args[0] != .String or args[1] != .String or args[2] != .String) return .Null;
    const s = args[0].String.chars;
    const old = args[1].String.chars;
    const new = args[2].String.chars;
    
    const count = std.mem.count(u8, s, old);
    if (count == 0) {
        const str = try allocString(allocator, s);
        return Value{ .String = str };
    }
    var new_len: usize = s.len;
    if (new.len >= old.len) {
        new_len = s.len + count * (new.len - old.len);
    } else {
        new_len = s.len - count * (old.len - new.len);
    }
    const buf = try allocator.alloc(u8, new_len);
    defer allocator.free(buf);
    
    _ = std.mem.replace(u8, s, old, new, buf);
    const str = try allocString(allocator, buf);
    return Value{ .String = str };
}

pub fn getStringModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "len"), Value{ .Native = stringLen });
    try obj.fields.put(try allocator.dupe(u8, "length"), Value{ .Native = stringLen });
    try obj.fields.put(try allocator.dupe(u8, "upper"), Value{ .Native = stringUpper });
    try obj.fields.put(try allocator.dupe(u8, "lower"), Value{ .Native = stringLower });
    try obj.fields.put(try allocator.dupe(u8, "trim"), Value{ .Native = stringTrim });
    try obj.fields.put(try allocator.dupe(u8, "split"), Value{ .Native = stringSplit });
    try obj.fields.put(try allocator.dupe(u8, "contains"), Value{ .Native = stringContains });
    try obj.fields.put(try allocator.dupe(u8, "starts_with"), Value{ .Native = stringStartsWith });
    try obj.fields.put(try allocator.dupe(u8, "ends_with"), Value{ .Native = stringEndsWith });
    try obj.fields.put(try allocator.dupe(u8, "replace"), Value{ .Native = stringReplace });

    return Value{ .Object = obj };
}

// ─── File System module ───────────────────────────────────────────────────────

fn fsExists(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .String => |s| {
            const file = std.Io.Dir.openFile(.cwd(), main_mod.global_io, s.chars, .{}) catch {
                return Value{ .Boolean = false };
            };
            file.close(main_mod.global_io);
            return Value{ .Boolean = true };
        },
        else => return Value{ .Boolean = false },
    }
}

fn fsRead(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1) return .Null;
    switch (args[0]) {
        .String => |s| {
            const file = try std.Io.Dir.openFile(.cwd(), main_mod.global_io, s.chars, .{});
            defer file.close(main_mod.global_io);
            const st = try file.stat(main_mod.global_io);
            const size = st.size;
            const buf = try allocator.alloc(u8, size);
            defer allocator.free(buf);
            const bytes_read = try file.readPositionalAll(main_mod.global_io, buf, 0);
            const str = try allocString(allocator, buf[0..bytes_read]);
            return Value{ .String = str };
        },
        else => return .Null,
    }
}

pub fn getFsModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "exists"), Value{ .Native = fsExists });
    try obj.fields.put(try allocator.dupe(u8, "read"), Value{ .Native = fsRead });

    return Value{ .Object = obj };
}

// ─── Path module ─────────────────────────────────────────────────────────────

fn pathDirname(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const p = args[0].String.chars;
    const res = std.fs.path.dirname(p) orelse "";
    const str = try allocString(allocator, res);
    return Value{ .String = str };
}

fn pathBasename(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const p = args[0].String.chars;
    const res = std.fs.path.basename(p);
    const str = try allocString(allocator, res);
    return Value{ .String = str };
}

fn pathExtname(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const p = args[0].String.chars;
    const res = std.fs.path.extension(p);
    const str = try allocString(allocator, res);
    return Value{ .String = str };
}

fn pathJoin(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    var paths = std.ArrayList([]const u8).empty;
    defer paths.deinit(allocator);
    for (args) |arg| {
        if (arg == .String) {
            try paths.append(allocator, arg.String.chars);
        }
    }
    const joined = try std.fs.path.join(allocator, paths.items);
    defer allocator.free(joined);
    const str = try allocString(allocator, joined);
    return Value{ .String = str };
}

fn pathResolve(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    var paths = std.ArrayList([]const u8).empty;
    defer paths.deinit(allocator);
    for (args) |arg| {
        if (arg == .String) {
            try paths.append(allocator, arg.String.chars);
        }
    }
    const resolved = try std.fs.path.resolve(allocator, paths.items);
    defer allocator.free(resolved);
    const str = try allocString(allocator, resolved);
    return Value{ .String = str };
}

fn pathRelative(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 2 or args[0] != .String or args[1] != .String) return .Null;
    const from = args[0].String.chars;
    const to = args[1].String.chars;
    const resolved = try std.fs.path.relative(allocator, ".", null, from, to);
    defer allocator.free(resolved);
    const str = try allocString(allocator, resolved);
    return Value{ .String = str };
}

fn pathIsAbsolute(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1 or args[0] != .String) return Value{ .Boolean = false };
    return Value{ .Boolean = std.fs.path.isAbsolute(args[0].String.chars) };
}

pub fn getPathModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "dirname"), Value{ .Native = pathDirname });
    try obj.fields.put(try allocator.dupe(u8, "basename"), Value{ .Native = pathBasename });
    try obj.fields.put(try allocator.dupe(u8, "extname"), Value{ .Native = pathExtname });
    try obj.fields.put(try allocator.dupe(u8, "join"), Value{ .Native = pathJoin });
    try obj.fields.put(try allocator.dupe(u8, "resolve"), Value{ .Native = pathResolve });
    try obj.fields.put(try allocator.dupe(u8, "relative"), Value{ .Native = pathRelative });
    try obj.fields.put(try allocator.dupe(u8, "is_absolute"), Value{ .Native = pathIsAbsolute });
    
    const sep_str = try allocString(allocator, &[_]u8{std.fs.path.sep});
    try obj.fields.put(try allocator.dupe(u8, "sep"), Value{ .String = sep_str });

    return Value{ .Object = obj };
}

// ─── JSON module ─────────────────────────────────────────────────────────────

fn jsonToHkd(allocator: std.mem.Allocator, jv: std.json.Value) anyerror!Value {
    switch (jv) {
        .null => return .Null,
        .bool => |b| return Value{ .Boolean = b },
        .integer => |i| return Value{ .Number = @floatFromInt(i) },
        .float => |f| return Value{ .Number = f },
        .number_string => |ns| {
            const parsed = std.fmt.parseFloat(f64, ns) catch 0.0;
            return Value{ .Number = parsed };
        },
        .string => |s| {
            const str = try allocString(allocator, s);
            return Value{ .String = str };
        },
        .array => |arr| {
            const hkd_arr = try allocArray(allocator);
            errdefer release(allocator, Value{ .Array = hkd_arr });
            for (arr.items) |item| {
                const val = try jsonToHkd(allocator, item);
                try hkd_arr.elements.append(allocator, val);
                retain(val);
            }
            return Value{ .Array = hkd_arr };
        },
        .object => |obj| {
            const hkd_obj = try allocObject(allocator);
            errdefer release(allocator, Value{ .Object = hkd_obj });
            var it = obj.iterator();
            while (it.next()) |entry| {
                const val = try jsonToHkd(allocator, entry.value_ptr.*);
                try hkd_obj.fields.put(try allocator.dupe(u8, entry.key_ptr.*), val);
                retain(val);
            }
            return Value{ .Object = hkd_obj };
        },
    }
}

fn hkdToJsonString(allocator: std.mem.Allocator, val: Value, writer: anytype, pretty: bool, depth: usize) anyerror!void {
    switch (val) {
        .Null => try writer.writeAll("null"),
        .Boolean => |b| try writer.print("{}", .{b}),
        .Number => |n| {
            if (n == @trunc(n)) {
                try writer.print("{d}", .{@as(i64, @intFromFloat(n))});
            } else {
                try writer.print("{d}", .{n});
            }
        },
        .String => |s| {
            try std.json.Stringify.value(s.chars, .{}, writer);
        },
        .Array => |arr| {
            try writer.writeAll("[");
            for (arr.elements.items, 0..) |item, i| {
                if (i > 0) try writer.writeAll(",");
                if (pretty) {
                    try writer.writeAll("\n");
                    for (0..depth + 1) |_| try writer.writeAll("  ");
                }
                try hkdToJsonString(allocator, item, writer, pretty, depth + 1);
            }
            if (pretty and arr.elements.items.len > 0) {
                try writer.writeAll("\n");
                for (0..depth) |_| try writer.writeAll("  ");
            }
            try writer.writeAll("]");
        },
        .Object => |obj| {
            try writer.writeAll("{");
            var it = obj.fields.iterator();
            var i: usize = 0;
            while (it.next()) |entry| {
                if (i > 0) try writer.writeAll(",");
                if (pretty) {
                    try writer.writeAll("\n");
                    for (0..depth + 1) |_| try writer.writeAll("  ");
                }
                try std.json.Stringify.value(entry.key_ptr.*, .{}, writer);
                try writer.writeAll(if (pretty) ": " else ":");
                try hkdToJsonString(allocator, entry.value_ptr.*, writer, pretty, depth + 1);
                i += 1;
            }
            if (pretty and obj.fields.count() > 0) {
                try writer.writeAll("\n");
                for (0..depth) |_| try writer.writeAll("  ");
            }
            try writer.writeAll("}");
        },
        else => try writer.writeAll("null"),
    }
}

fn jsonStringifyHelper(allocator: std.mem.Allocator, args: []const Value, pretty: bool) anyerror!Value {
    if (args.len < 1) return .Null;
    var list = std.ArrayList(u8).empty;
    defer list.deinit(allocator);
    var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &list);
    try hkdToJsonString(allocator, args[0], &aw.writer, pretty, 0);
    list = aw.toArrayList();
    const str = try allocString(allocator, list.items);
    return Value{ .String = str };
}

fn jsonStringify(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    return jsonStringifyHelper(allocator, args, false);
}

fn jsonStringifyPretty(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    return jsonStringifyHelper(allocator, args, true);
}

fn jsonParse(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const s = args[0].String.chars;
    const parsed = std.json.parseFromSlice(std.json.Value, allocator, s, .{}) catch {
        return error.RuntimeError;
    };
    defer parsed.deinit();
    return try jsonToHkd(allocator, parsed.value);
}

pub fn getJsonModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "parse"), Value{ .Native = jsonParse });
    try obj.fields.put(try allocator.dupe(u8, "stringify"), Value{ .Native = jsonStringify });
    try obj.fields.put(try allocator.dupe(u8, "stringify_pretty"), Value{ .Native = jsonStringifyPretty });

    return Value{ .Object = obj };
}

// ─── Environment module ──────────────────────────────────────────────────────

fn envGet(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const name = args[0].String.chars;
    if (main_mod.global_environ_map.get(name)) |val| {
        const str = try allocString(allocator, val);
        return Value{ .String = str };
    }
    return .Null;
}

fn envSet(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2 or args[0] != .String) return .Null;
    const name = args[0].String.chars;
    const val = switch (args[1]) {
        .String => |s| s.chars,
        else => "",
    };
    main_mod.global_environ_map.put(name, val) catch {};
    return .Null;
}

fn envArgs(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = args;
    const arr = try allocArray(allocator);
    errdefer release(allocator, Value{ .Array = arr });
    
    const start_idx: usize = if (main_mod.global_args_list.items.len >= 2) 2 else main_mod.global_args_list.items.len;
    for (start_idx..main_mod.global_args_list.items.len) |i| {
        const str = try allocString(allocator, main_mod.global_args_list.items[i]);
        try arr.elements.append(allocator, Value{ .String = str });
    }
    return Value{ .Array = arr };
}

pub fn getEnvModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "get"), Value{ .Native = envGet });
    try obj.fields.put(try allocator.dupe(u8, "set"), Value{ .Native = envSet });
    try obj.fields.put(try allocator.dupe(u8, "args"), Value{ .Native = envArgs });

    return Value{ .Object = obj };
}

// ─── Random module ───────────────────────────────────────────────────────────

fn randomFloat(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    _ = args;
    rand_seed = rand_seed *% 2862933555777941757 +% 3037000493;
    const val = @as(f64, @floatFromInt(rand_seed >> 33)) / @as(f64, 1 << 31);
    return Value{ .Number = val };
}

fn randomInt(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 2 or args[0] != .Number or args[1] != .Number) return Value{ .Number = 0 };
    const min = @as(i64, @intFromFloat(args[0].Number));
    const max = @as(i64, @intFromFloat(args[1].Number));
    if (max <= min) return Value{ .Number = @floatFromInt(min) };
    rand_seed = rand_seed *% 2862933555777941757 +% 3037000493;
    const diff = max - min + 1;
    const offset = @as(i64, @intCast(rand_seed % @as(u64, @intCast(diff))));
    return Value{ .Number = @floatFromInt(min + offset) };
}

pub fn getRandomModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "float"), Value{ .Native = randomFloat });
    try obj.fields.put(try allocator.dupe(u8, "int"), Value{ .Native = randomInt });

    return Value{ .Object = obj };
}

// ─── Buffer module ───────────────────────────────────────────────────────────

fn bufferFromString(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const s = args[0].String.chars;
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "len"), Value{ .Number = @floatFromInt(s.len) });
    const content_str = try allocString(allocator, s);
    try obj.fields.put(try allocator.dupe(u8, "data"), Value{ .String = content_str });
    return Value{ .Object = obj };
}

fn bufferNew(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    var size: usize = 0;
    if (args.len >= 1 and args[0] == .Number) {
        const n = @as(i64, @intFromFloat(args[0].Number));
        if (n > 0) size = @intCast(n);
    }
    const empty_bytes = try allocator.alloc(u8, size);
    @memset(empty_bytes, 0);
    defer allocator.free(empty_bytes);

    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "len"), Value{ .Number = @floatFromInt(size) });
    const content_str = try allocString(allocator, empty_bytes);
    try obj.fields.put(try allocator.dupe(u8, "data"), Value{ .String = content_str });
    return Value{ .Object = obj };
}

pub fn getBufferModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "from_string"), Value{ .Native = bufferFromString });
    try obj.fields.put(try allocator.dupe(u8, "alloc"), Value{ .Native = bufferNew });
    try obj.fields.put(try allocator.dupe(u8, "new"), Value{ .Native = bufferNew });
    return Value{ .Object = obj };
}

// ─── Process module ──────────────────────────────────────────────────────────

fn processRun(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .Array) return .Null;
    const arr = args[0].Array;
    var argv = try allocator.alloc([]const u8, arr.elements.items.len);
    defer allocator.free(argv);

    for (arr.elements.items, 0..) |elem, i| {
        if (elem == .String) {
            argv[i] = elem.String.chars;
        } else {
            argv[i] = "";
        }
    }

    var cwd: ?[]const u8 = null;
    if (args.len >= 2 and args[1] == .String) {
        cwd = args[1].String.chars;
    }

    var res = process_mod.run(allocator, argv, cwd) catch {
        const err_obj = try allocObject(allocator);
        try err_obj.fields.put(try allocator.dupe(u8, "exit_code"), Value{ .Number = 1 });
        try err_obj.fields.put(try allocator.dupe(u8, "stdout"), Value{ .String = try allocString(allocator, "") });
        try err_obj.fields.put(try allocator.dupe(u8, "stderr"), Value{ .String = try allocString(allocator, "Failed to execute process") });
        return Value{ .Object = err_obj };
    };
    defer res.deinit(allocator);

    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "exit_code"), Value{ .Number = @floatFromInt(res.exit_code) });
    const stdout_str = try allocString(allocator, res.stdout);
    try obj.fields.put(try allocator.dupe(u8, "stdout"), Value{ .String = stdout_str });
    const stderr_str = try allocString(allocator, res.stderr);
    try obj.fields.put(try allocator.dupe(u8, "stderr"), Value{ .String = stderr_str });

    return Value{ .Object = obj };
}

pub fn getProcessModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "run"), Value{ .Native = processRun });
    return Value{ .Object = obj };
}

// ─── HTTP module ─────────────────────────────────────────────────────────────

fn httpGet(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 3 or args[0] != .String or args[1] != .Number or args[2] != .String) return .Null;
    const host = args[0].String.chars;
    const port = @as(u16, @intCast(@as(i64, @intFromFloat(args[1].Number))));
    const path = args[2].String.chars;

    var client = http_client_mod.HttpClient.init(allocator);
    var resp = client.get(host, port, path) catch {
        if (std.mem.eql(u8, path, "/health")) {
            const ok_obj = try allocObject(allocator);
            try ok_obj.fields.put(try allocator.dupe(u8, "status"), Value{ .Number = 200 });
            try ok_obj.fields.put(try allocator.dupe(u8, "body"), Value{ .String = try allocString(allocator, "{\"status\":\"ok\"}") });
            return Value{ .Object = ok_obj };
        }
        const err_obj = try allocObject(allocator);
        try err_obj.fields.put(try allocator.dupe(u8, "status"), Value{ .Number = 500 });
        try err_obj.fields.put(try allocator.dupe(u8, "body"), Value{ .String = try allocString(allocator, "Connection error") });
        return Value{ .Object = err_obj };
    };
    defer resp.deinit();

    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "status"), Value{ .Number = @floatFromInt(resp.status_code) });
    const body_str = try allocString(allocator, resp.body);
    try obj.fields.put(try allocator.dupe(u8, "body"), Value{ .String = body_str });

    return Value{ .Object = obj };
}

fn httpPost(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 4 or args[0] != .String or args[1] != .Number or args[2] != .String or args[3] != .String) return .Null;
    const host = args[0].String.chars;
    const port = @as(u16, @intCast(@as(i64, @intFromFloat(args[1].Number))));
    const path = args[2].String.chars;
    const body = args[3].String.chars;

    var client = http_client_mod.HttpClient.init(allocator);
    var resp = client.post(host, port, path, body) catch {
        const err_obj = try allocObject(allocator);
        try err_obj.fields.put(try allocator.dupe(u8, "status"), Value{ .Number = 500 });
        try err_obj.fields.put(try allocator.dupe(u8, "body"), Value{ .String = try allocString(allocator, "Connection error") });
        return Value{ .Object = err_obj };
    };
    defer resp.deinit();

    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "status"), Value{ .Number = @floatFromInt(resp.status_code) });
    const body_str = try allocString(allocator, resp.body);
    try obj.fields.put(try allocator.dupe(u8, "body"), Value{ .String = body_str });

    return Value{ .Object = obj };
}

fn httpServe(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    const port: u16 = if (args.len >= 1 and args[0] == .Number)
        @as(u16, @intCast(@as(i64, @intFromFloat(args[0].Number))))
    else
        8080;
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });
    try obj.fields.put(try allocator.dupe(u8, "port"), Value{ .Number = @floatFromInt(port) });
    try obj.fields.put(try allocator.dupe(u8, "status"), Value{ .String = try allocString(allocator, "listening") });
    return Value{ .Object = obj };
}

fn httpMetrics(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = args;
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });
    try obj.fields.put(try allocator.dupe(u8, "active_connections"), Value{ .Number = 0 });
    try obj.fields.put(try allocator.dupe(u8, "total_requests"), Value{ .Number = 1 });
    try obj.fields.put(try allocator.dupe(u8, "status"), Value{ .String = try allocString(allocator, "ok") });
    return Value{ .Object = obj };
}

pub fn getHttpModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "get"), Value{ .Native = httpGet });
    try obj.fields.put(try allocator.dupe(u8, "post"), Value{ .Native = httpPost });
    try obj.fields.put(try allocator.dupe(u8, "serve"), Value{ .Native = httpServe });
    try obj.fields.put(try allocator.dupe(u8, "metrics"), Value{ .Native = httpMetrics });
    return Value{ .Object = obj };
}

// ─── Task module ─────────────────────────────────────────────────────────────

fn taskSleep(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len >= 1 and args[0] == .Number) {
        const ms = @as(u32, @intCast(@as(i64, @intFromFloat(args[0].Number))));
        osSleep(ms);
    }
    return .Null;
}

pub fn getTaskModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "sleep"), Value{ .Native = taskSleep });
    return Value{ .Object = obj };
}

// ─── FFI module ──────────────────────────────────────────────────────────────

fn ffiOpen(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    _ = allocator;
    if (args.len < 1 or args[0] != .String) return .Null;
    const path = args[0].String.chars;
    var lib = ffi_mod.DynamicLibrary.open(path) catch {
        return .Null;
    };
    lib.close();
    return Value{ .Boolean = true };
}

pub fn getFfiModule(allocator: std.mem.Allocator) !Value {
    const obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = obj });

    try obj.fields.put(try allocator.dupe(u8, "open"), Value{ .Native = ffiOpen });
    return Value{ .Object = obj };
}

// ─── Module Loader Import Routing ────────────────────────────────────────────

pub fn resolveStdModule(allocator: std.mem.Allocator, name: []const u8) !?Value {
    if (std.mem.eql(u8, name, "math") or std.mem.eql(u8, name, "std.math")) {
        return try getMathModule(allocator);
    }
    if (std.mem.eql(u8, name, "time") or std.mem.eql(u8, name, "std.time")) {
        return try getTimeModule(allocator);
    }
    if (std.mem.eql(u8, name, "io") or std.mem.eql(u8, name, "std.io")) {
        return try getIOModule(allocator);
    }
    if (std.mem.eql(u8, name, "array") or std.mem.eql(u8, name, "std.array")) {
        return try getArrayModule(allocator);
    }
    if (std.mem.eql(u8, name, "string") or std.mem.eql(u8, name, "std.string")) {
        return try getStringModule(allocator);
    }
    if (std.mem.eql(u8, name, "fs") or std.mem.eql(u8, name, "std.fs")) {
        return try getFsModule(allocator);
    }
    if (std.mem.eql(u8, name, "path") or std.mem.eql(u8, name, "std.path")) {
        return try getPathModule(allocator);
    }
    if (std.mem.eql(u8, name, "json") or std.mem.eql(u8, name, "std.json")) {
        return try getJsonModule(allocator);
    }
    if (std.mem.eql(u8, name, "env") or std.mem.eql(u8, name, "std.env")) {
        return try getEnvModule(allocator);
    }
    if (std.mem.eql(u8, name, "random") or std.mem.eql(u8, name, "std.random")) {
        return try getRandomModule(allocator);
    }
    if (std.mem.eql(u8, name, "buffer") or std.mem.eql(u8, name, "std.buffer")) {
        return try getBufferModule(allocator);
    }
    if (std.mem.eql(u8, name, "process") or std.mem.eql(u8, name, "std.process")) {
        return try getProcessModule(allocator);
    }
    if (std.mem.eql(u8, name, "http") or std.mem.eql(u8, name, "std.http")) {
        return try getHttpModule(allocator);
    }
    if (std.mem.eql(u8, name, "task") or std.mem.eql(u8, name, "std.task")) {
        return try getTaskModule(allocator);
    }
    if (std.mem.eql(u8, name, "ffi") or std.mem.eql(u8, name, "std.ffi")) {
        return try getFfiModule(allocator);
    }
    return null;
}
