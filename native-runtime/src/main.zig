const std = @import("std");
const builtin = @import("builtin");
const value_mod = @import("value.zig");
const Value = value_mod.Value;
const HkdString = value_mod.HkdString;
const HkdFunction = value_mod.HkdFunction;
const HkdObject = value_mod.HkdObject;
const allocString = value_mod.allocString;
const allocObject = value_mod.allocObject;
const retain = value_mod.retain;
const release = value_mod.release;
const vm_mod = @import("vm.zig");
const VM = vm_mod.VM;
const validator_mod = @import("validator.zig");
pub const runtime_abi = @import("jit/runtime_abi.zig");
pub const native_value = @import("jit/native_value.zig");
pub const x86_64 = @import("jit/x86_64.zig");
pub const jit = @import("jit/jit.zig");
pub const deopt = @import("jit/deopt.zig");
pub const profiler = @import("profiler/profiler.zig");
pub const specialization = @import("jit/specialization.zig");
test { 
    _ = runtime_abi;
    _ = native_value;
    _ = x86_64;
    _ = jit;
    _ = deopt;
    _ = profiler;
    _ = specialization;
}

pub var global_io: std.Io = undefined;
pub var skip_validation: bool = false;
pub var show_mem_stats: bool = false;
pub var enable_jit: bool = false;
pub var show_jit_stats: bool = false;
pub var enable_profiler: bool = false;
pub var profile_output_path: ?[]const u8 = null;

pub const TrackingAllocator = struct {
    parent: std.mem.Allocator,
    total_allocations: usize = 0,
    total_deallocations: usize = 0,
    allocated_bytes: usize = 0,
    deallocated_bytes: usize = 0,
    peak_bytes: usize = 0,
    active_bytes: usize = 0,
    active_allocs: std.AutoHashMap(usize, usize),

    pub fn init(parent: std.mem.Allocator) TrackingAllocator {
        return .{
            .parent = parent,
            .active_allocs = std.AutoHashMap(usize, usize).init(parent),
        };
    }

    pub fn allocator(self: *TrackingAllocator) std.mem.Allocator {
        return .{
            .ptr = self,
            .vtable = &.{
                .alloc = alloc,
                .resize = resize,
                .remap = remap,
                .free = free,
            },
        };
    }

    fn alloc(ctx: *anyopaque, len: usize, ptr_align: std.mem.Alignment, ret_addr: usize) ?[*]u8 {
        const self: *TrackingAllocator = @alignCast(@ptrCast(ctx));
        const result = self.parent.vtable.alloc(self.parent.ptr, len, ptr_align, ret_addr);
        if (result) |ptr| {
            self.total_allocations += 1;
            self.allocated_bytes += len;
            self.active_bytes += len;
            if (self.active_bytes > self.peak_bytes) {
                self.peak_bytes = self.active_bytes;
            }
            if (show_mem_stats) {
                self.active_allocs.put(@intFromPtr(ptr), len) catch {};
            }
            return ptr;
        }
        return null;
    }

    fn resize(ctx: *anyopaque, buf: []u8, log_align: std.mem.Alignment, new_len: usize, ret_addr: usize) bool {
        const self: *TrackingAllocator = @alignCast(@ptrCast(ctx));
        const old_len = buf.len;
        if (self.parent.vtable.resize(self.parent.ptr, buf, log_align, new_len, ret_addr)) {
            if (new_len > old_len) {
                const diff = new_len - old_len;
                self.allocated_bytes += diff;
                self.active_bytes += diff;
                if (self.active_bytes > self.peak_bytes) {
                    self.peak_bytes = self.active_bytes;
                }
            } else {
                const diff = old_len - new_len;
                self.deallocated_bytes += diff;
                self.active_bytes -= diff;
            }
            if (show_mem_stats) {
                const ptr_addr = @intFromPtr(buf.ptr);
                _ = self.active_allocs.remove(ptr_addr);
                self.active_allocs.put(ptr_addr, new_len) catch {};
            }
            return true;
        }
        return false;
    }

    fn remap(ctx: *anyopaque, memory: []u8, alignment: std.mem.Alignment, new_len: usize, ret_addr: usize) ?[*]u8 {
        const self: *TrackingAllocator = @alignCast(@ptrCast(ctx));
        const old_len = memory.len;
        const result = self.parent.vtable.remap(self.parent.ptr, memory, alignment, new_len, ret_addr);
        if (result) |ptr| {
            if (new_len > old_len) {
                const diff = new_len - old_len;
                self.allocated_bytes += diff;
                self.active_bytes += diff;
                if (self.active_bytes > self.peak_bytes) {
                    self.peak_bytes = self.active_bytes;
                }
            } else {
                const diff = old_len - new_len;
                self.deallocated_bytes += diff;
                self.active_bytes -= diff;
            }
            if (show_mem_stats) {
                _ = self.active_allocs.remove(@intFromPtr(memory.ptr));
                self.active_allocs.put(@intFromPtr(ptr), new_len) catch {};
            }
            return ptr;
        }
        return null;
    }

    fn free(ctx: *anyopaque, buf: []u8, log_align: std.mem.Alignment, ret_addr: usize) void {
        const self: *TrackingAllocator = @alignCast(@ptrCast(ctx));
        const len = buf.len;
        self.parent.vtable.free(self.parent.ptr, buf, log_align, ret_addr);
        self.total_deallocations += 1;
        self.deallocated_bytes += len;
        self.active_bytes -= len;
        if (show_mem_stats) {
            _ = self.active_allocs.remove(@intFromPtr(buf.ptr));
        }
    }
};

// ─── Bytecode Reader / Deserializer ──────────────────────────────────────────

const BytecodeReader = struct {
    bytes: []const u8,
    offset: usize = 0,

    fn readByte(self: *BytecodeReader) u8 {
        const b = self.bytes[self.offset];
        self.offset += 1;
        return b;
    }

    fn readU16(self: *BytecodeReader) u16 {
        const val = (@as(u16, self.bytes[self.offset]) << 8) | self.bytes[self.offset + 1];
        self.offset += 2;
        return val;
    }

    fn readU32(self: *BytecodeReader) u32 {
        const val = (@as(u32, self.bytes[self.offset]) << 24) |
                    (@as(u32, self.bytes[self.offset + 1]) << 16) |
                    (@as(u32, self.bytes[self.offset + 2]) << 8) |
                    self.bytes[self.offset + 3];
        self.offset += 4;
        return val;
    }

    fn readF64(self: *BytecodeReader) f64 {
        const bytes = self.bytes[self.offset .. self.offset + 8];
        self.offset += 8;
        const u = (@as(u64, bytes[0]) << 56) |
                  (@as(u64, bytes[1]) << 48) |
                  (@as(u64, bytes[2]) << 40) |
                  (@as(u64, bytes[3]) << 32) |
                  (@as(u64, bytes[4]) << 24) |
                  (@as(u64, bytes[5]) << 16) |
                  (@as(u64, bytes[6]) << 8) |
                  bytes[7];
        return @as(f64, @bitCast(u));
    }

    fn readString(self: *BytecodeReader, allocator: std.mem.Allocator) ![]const u8 {
        const len = self.readU16();
        if (self.offset + len > self.bytes.len) return error.MalformedBytecode;
        const str = try allocator.alloc(u8, len);
        @memcpy(str, self.bytes[self.offset .. self.offset + len]);
        self.offset += len;
        return str;
    }
};

fn deserializeFunction(reader: *BytecodeReader, allocator: std.mem.Allocator) anyerror!*HkdFunction {
    const name = try reader.readString(allocator);
    errdefer allocator.free(name);

    const arity = reader.readByte();
    const local_count = reader.readU16();
    const upvalue_count = reader.readU16();

    const code_len = reader.readU32();
    if (reader.offset + code_len > reader.bytes.len) return error.MalformedBytecode;
    const code = try allocator.alloc(u8, code_len);
    errdefer allocator.free(code);
    @memcpy(code, reader.bytes[reader.offset .. reader.offset + code_len]);
    reader.offset += code_len;

    const lines_len = reader.readU32();
    if (reader.offset + lines_len * 2 > reader.bytes.len) return error.MalformedBytecode;
    const lines = try allocator.alloc(u16, lines_len);
    errdefer allocator.free(lines);
    var i: usize = 0;
    while (i < lines_len) : (i += 1) {
        lines[i] = reader.readU16();
    }

    const const_count = reader.readU16();
    const constants = try allocator.alloc(Value, const_count);
    errdefer allocator.free(constants);

    i = 0;
    while (i < const_count) : (i += 1) {
        const tag = reader.readByte();
        switch (tag) {
            0x00 => constants[i] = .Null,
            0x01 => constants[i] = Value{ .Boolean = false },
            0x02 => constants[i] = Value{ .Boolean = true },
            0x03 => constants[i] = Value{ .Number = reader.readF64() },
            0x04 => {
                const s_chars = try reader.readString(allocator);
                defer allocator.free(s_chars);
                const s = try allocString(allocator, s_chars);
                constants[i] = Value{ .String = s };
            },
            0x05 => {
                const f = try deserializeFunction(reader, allocator);
                constants[i] = Value{ .Function = f };
            },
            else => return error.MalformedBytecode,
        }
    }

    const f = try allocator.create(HkdFunction);
    f.* = .{
        .name = name,
        .arity = arity,
        .local_count = local_count,
        .upvalue_count = upvalue_count,
        .code = code,
        .lines = lines,
        .constants = constants,
    };
    return f;
}

fn deserializeProgram(bytes: []const u8, allocator: std.mem.Allocator) !*HkdFunction {
    if (bytes.len < 8) {
        std.debug.print("error: malformed bytecode header\n", .{});
        return error.MalformedBytecode;
    }
    if (!std.mem.eql(u8, bytes[0..4], "HKDB")) {
        std.debug.print("error: invalid file header (magic must be 'HKDB')\n", .{});
        return error.InvalidMagic;
    }
    const format_version = bytes[4];
    if (format_version != 1) {
        std.debug.print("error: unsupported HKDB bytecode version {}\n", .{format_version});
        std.debug.print("runtime supports version 1\n", .{});
        return error.UnsupportedVersion;
    }
    var reader = BytecodeReader{ .bytes = bytes, .offset = 8 };
    const func = try deserializeFunction(&reader, allocator);
    if (!skip_validation) {
        validator_mod.validateFunction(func) catch |e| {
            std.debug.print("error: bytecode validation failed: {}\n", .{e});
            func.deinit(allocator);
            return e;
        };
    }
    return func;
}

// ─── Module Loader Context ───────────────────────────────────────────────────
pub var current_vm: ?*VM = null;
pub var global_environ_map: *std.process.Environ.Map = undefined;
pub var global_args_list: std.ArrayList([]const u8) = undefined;

var module_cache: std.StringHashMap(Value) = undefined;
var active_imports: std.StringHashMap(void) = undefined;
var loaded_functions: std.ArrayList(*value_mod.HkdFunction) = undefined;
var root_file_dir: []const u8 = "";

fn isBuiltinName(key: []const u8) bool {
    const builtins = [_][]const u8{
        "print", "println", "len", "to_string", "to_bool", "to_int",
        "to_float", "type_of", "exit", "range", "panic", "assert",
        "__assert__", "__import__", "__register_test__",
    };
    for (builtins) |b| {
        if (std.mem.eql(u8, key, b)) return true;
    }
    return false;
}

fn nativeImport(allocator: std.mem.Allocator, args: []const Value) anyerror!Value {
    if (args.len < 1 or args[0] != .String) return .Null;
    const module_path = args[0].String.chars;

    // 1. Resolve standard libraries
    if (try @import("stdlib.zig").resolveStdModule(allocator, module_path)) |std_mod| {
        return std_mod;
    }

    // 2. Resolve relative path or climbing package dependency
    var resolved_path: []const u8 = undefined;
    if (std.fs.path.isAbsolute(module_path)) {
        resolved_path = try allocator.dupe(u8, module_path);
    } else if (std.mem.startsWith(u8, module_path, "./") or std.mem.startsWith(u8, module_path, "../")) {
        resolved_path = try std.fs.path.resolve(allocator, &[_][]const u8{ root_file_dir, module_path });
    } else {
        // Climbing up parent directories to find .hkd/deps/<module_path>
        var found = false;
        var cur_dir = try allocator.dupe(u8, root_file_dir);
        defer allocator.free(cur_dir);
        while (true) {
            const deps_dir = try std.fs.path.join(allocator, &[_][]const u8{ cur_dir, ".hkd", "deps", module_path });
            defer allocator.free(deps_dir);
            
            // Check if directory exists and has hkd.toml
            const manifest_path = try std.fs.path.join(allocator, &[_][]const u8{ deps_dir, "hkd.toml" });
            defer allocator.free(manifest_path);
            
            if (std.Io.Dir.openFile(.cwd(), global_io, manifest_path, .{})) |file| {
                file.close(global_io);
                resolved_path = try std.fs.path.resolve(allocator, &[_][]const u8{ deps_dir, "src", "main.hkd" });
                found = true;
                break;
            } else |_| {}
            
            const parent = std.fs.path.dirname(cur_dir);
            if (parent == null or std.mem.eql(u8, parent.?, cur_dir)) break;
            const next_dir = try allocator.dupe(u8, parent.?);
            allocator.free(cur_dir);
            cur_dir = next_dir;
        }
        if (!found) {
            resolved_path = try std.fs.path.resolve(allocator, &[_][]const u8{ root_file_dir, module_path });
        }
    }
    defer allocator.free(resolved_path);

    // Try resolving to .hkdb
    var final_path = try allocator.dupe(u8, resolved_path);
    errdefer allocator.free(final_path);
    if (std.mem.endsWith(u8, final_path, ".hkd")) {
        const temp = try allocator.alloc(u8, final_path.len + 1);
        @memcpy(temp[0 .. final_path.len - 4], final_path[0 .. final_path.len - 4]);
        @memcpy(temp[final_path.len - 4 ..], ".hkdb");
        allocator.free(final_path);
        final_path = temp;
    } else if (!std.mem.endsWith(u8, final_path, ".hkdb")) {
        const temp = try std.mem.concat(allocator, u8, &[_][]const u8{ final_path, ".hkdb" });
        allocator.free(final_path);
        final_path = temp;
    }

    // Check module cache
    if (module_cache.get(final_path)) |cached| {
        retain(cached);
        return cached;
    }

    // Check circular dependencies
    if (active_imports.contains(final_path)) {
        std.debug.print("Circular dependency detected: {s}\n", .{final_path});
        return error.RuntimeError;
    }

    try active_imports.put(try allocator.dupe(u8, final_path), {});
    defer {
        if (active_imports.fetchRemove(final_path)) |kv| {
            allocator.free(kv.key);
        }
    }

    // Read and parse module .hkdb
    const file = std.Io.Dir.openFile(.cwd(), global_io, final_path, .{}) catch {
        std.debug.print("Module not found: {s}\n", .{final_path});
        return error.RuntimeError;
    };
    defer file.close(global_io);

    const st = try file.stat(global_io);
    const size = st.size;
    const buffer = try allocator.alloc(u8, size);
    defer allocator.free(buffer);
    const bytes_read = try file.readPositionalAll(global_io, buffer, 0);
    
    const module_fn = deserializeProgram(buffer[0..bytes_read], allocator) catch |e| {
        std.debug.print("Malformed module bytecode in {s}\n", .{final_path});
        return e;
    };
    try loaded_functions.append(allocator, module_fn);

    // Run in isolated VM context
    var sub_vm = VM.init(allocator);
    defer sub_vm.deinit();

    // Set recursive loader
    try sub_vm.globals.put(try allocator.dupe(u8, "__import__"), Value{ .Native = nativeImport });

    const parent_vm = current_vm;
    current_vm = &sub_vm;
    defer current_vm = parent_vm;

    const run_res = sub_vm.run(module_fn) catch {
        std.debug.print("Runtime error during module load\n", .{});
        return error.RuntimeError;
    };
    release(allocator, run_res);

    // Collect non-builtin globals as exported fields
    const mod_obj = try allocObject(allocator);
    errdefer release(allocator, Value{ .Object = mod_obj });

    var git = sub_vm.globals.iterator();
    while (git.next()) |entry| {
        const key = entry.key_ptr.*;
        if (!isBuiltinName(key)) {
            try mod_obj.fields.put(try allocator.dupe(u8, key), entry.value_ptr.*);
            retain(entry.value_ptr.*);

            if (parent_vm) |p_vm| {
                if (try p_vm.globals.fetchPut(try allocator.dupe(u8, key), entry.value_ptr.*)) |old| {
                    allocator.free(old.key);
                    release(allocator, old.value);
                }
                retain(entry.value_ptr.*);
            }
        }
    }

    const mod_val = Value{ .Object = mod_obj };
    try module_cache.put(try allocator.dupe(u8, final_path), mod_val);
    retain(mod_val);

    return mod_val;
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────

pub fn main(init: std.process.Init) !void {
    global_io = init.io;
    global_environ_map = init.environ_map;
    var tracking_allocator = TrackingAllocator.init(std.heap.smp_allocator);
    const allocator = tracking_allocator.allocator();

    global_args_list = std.ArrayList([]const u8).empty;
    defer {
        for (global_args_list.items) |arg| {
            allocator.free(arg);
        }
        global_args_list.deinit(allocator);
    }

    var args_it_temp = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args_it_temp.deinit();
    while (args_it_temp.next()) |arg| {
        try global_args_list.append(allocator, try allocator.dupe(u8, arg));
    }

    defer if (show_mem_stats) {
        std.debug.print("\n=== HKD Memory Statistics ===\n", .{});
        std.debug.print("Total Allocations:   {}\n", .{tracking_allocator.total_allocations});
        std.debug.print("Total Deallocations: {}\n", .{tracking_allocator.total_deallocations});
        std.debug.print("Peak Memory Usage:   {d:.2} KB\n", .{@as(f64, @floatFromInt(tracking_allocator.peak_bytes)) / 1024.0});
        std.debug.print("Leaked Memory:       {d:.2} KB\n", .{@as(f64, @floatFromInt(tracking_allocator.active_bytes)) / 1024.0});
        
        if (tracking_allocator.active_bytes > 0) {
            std.debug.print("Leaked Blocks Histogram:\n", .{});
            var size_counts = std.AutoHashMap(usize, usize).init(std.heap.smp_allocator);
            defer size_counts.deinit();
            var ait2 = tracking_allocator.active_allocs.iterator();
            while (ait2.next()) |entry| {
                const sz = entry.value_ptr.*;
                const prev = size_counts.get(sz) orelse 0;
                size_counts.put(sz, prev + 1) catch {};
            }
            var sc_it = size_counts.iterator();
            while (sc_it.next()) |entry| {
                std.debug.print("  - size: {} bytes, count: {}\n", .{entry.key_ptr.*, entry.value_ptr.*});
            }
        }
        show_mem_stats = false;
        tracking_allocator.active_allocs.deinit();
        std.debug.print("=============================\n", .{});
    };

    var args_it = try std.process.Args.Iterator.initAllocator(init.minimal.args, allocator);
    defer args_it.deinit();

    // Skip executable name
    _ = args_it.skip();

    var file_path_opt: ?[]const u8 = null;

    while (args_it.next()) |arg| {
        if (std.mem.eql(u8, arg, "--skip-validation")) {
            skip_validation = true;
        } else if (std.mem.eql(u8, arg, "--mem-stats")) {
            show_mem_stats = true;
        } else if (std.mem.eql(u8, arg, "--vm")) {
            enable_jit = false;
        } else if (std.mem.eql(u8, arg, "--jit")) {
            enable_jit = true;
        } else if (std.mem.eql(u8, arg, "--jit-stats")) {
            enable_jit = true;
            show_jit_stats = true;
        } else if (std.mem.eql(u8, arg, "--profile")) {
            enable_profiler = true;
        } else if (std.mem.startsWith(u8, arg, "--profile=")) {
            enable_profiler = true;
            profile_output_path = arg["--profile=".len..];
        } else if (std.mem.eql(u8, arg, "--help") or std.mem.eql(u8, arg, "-h")) {
            std.debug.print("HKD Native Bytecode Runtime\n", .{});
            std.debug.print("USAGE: hkd-runtime [options] <file.hkdb>\n", .{});
            std.debug.print("OPTIONS:\n", .{});
            std.debug.print("  --vm               Force Stack VM execution (default)\n", .{});
            std.debug.print("  --jit              Enable JIT native machine-code compilation\n", .{});
            std.debug.print("  --jit-stats        Display JIT engine compilation and deopt statistics\n", .{});
            std.debug.print("  --profile          Enable runtime execution profiling\n", .{});
            std.debug.print("  --profile=<path>   Write execution profile data to JSON file\n", .{});
            std.debug.print("  --mem-stats        Display memory allocations and peak RSS\n", .{});
            std.debug.print("  --skip-validation  Bypass bytecode pre-validation\n", .{});
            std.process.exit(0);
        } else if (std.mem.eql(u8, arg, "--version") or std.mem.eql(u8, arg, "-v")) {
            std.debug.print("HKD 1.0.0\n", .{});
            std.process.exit(0);
        } else {
            file_path_opt = arg;
        }
    }

    var buffer: []u8 = undefined;
    var allocated_buf: bool = false;
    defer if (allocated_buf) allocator.free(buffer);

    if (file_path_opt) |file_path| {
        const file = std.Io.Dir.openFile(.cwd(), global_io, file_path, .{}) catch {
            std.debug.print("File not found: {s}\n", .{file_path});
            std.process.exit(1);
        };
        defer file.close(global_io);

        const st = file.stat(global_io) catch |e| {
            std.debug.print("Failed to stat file: {}\n", .{e});
            std.process.exit(1);
        };
        const size = st.size;
        buffer = try allocator.alloc(u8, size);
        allocated_buf = true;
        const bytes_read = file.readPositionalAll(global_io, buffer, 0) catch |e| {
            std.debug.print("Failed to read file: {}\n", .{e});
            std.process.exit(1);
        };
        buffer = buffer[0..bytes_read];
    } else {
        // Inspect self executable file for embedded standalone payload
        var found_standalone = false;
        var exe_buf: [1024]u8 = undefined;
        var exe_len: usize = 0;

        if (comptime builtin.os.tag == .windows) {
            const kernel32 = struct {
                extern "kernel32" fn GetModuleFileNameA(hModule: ?*anyopaque, lpFilename: [*]u8, nSize: u32) callconv(.winapi) u32;
            };
            exe_len = kernel32.GetModuleFileNameA(null, &exe_buf, 1024);
        }

        if (exe_len > 0) {
            const exe_path = exe_buf[0..exe_len];
            if (std.Io.Dir.openFile(.cwd(), global_io, exe_path, .{})) |self_file| {
                defer self_file.close(global_io);
                if (self_file.stat(global_io)) |st| {
                    if (st.size > 16) {
                        var trailer: [16]u8 = undefined;
                        if (self_file.readPositionalAll(global_io, &trailer, st.size - 16)) |read_count| {
                            if (read_count == 16 and std.mem.eql(u8, trailer[8..16], "HKDSTAND")) {
                                const payload_len = std.mem.readInt(u64, trailer[0..8], .little);
                                if (st.size >= payload_len + 16) {
                                    const sbuf = try allocator.alloc(u8, payload_len);
                                    if (self_file.readPositionalAll(global_io, sbuf, st.size - 16 - payload_len)) |pcount| {
                                        if (pcount == payload_len) {
                                            buffer = sbuf;
                                            allocated_buf = true;
                                            found_standalone = true;
                                        }
                                    } else |_| {}
                                }
                            }
                        } else |_| {}
                    }
                } else |_| {}
            } else |_| {}
        }

        if (!found_standalone) {
            std.debug.print("USAGE: hkd-runtime [options] <file.hkdb>\n", .{});
            std.process.exit(2);
        }
    }

    const main_fn = deserializeProgram(buffer, allocator) catch |e| {
        std.debug.print("Failed to parse bytecode: {}\n", .{e});
        std.process.exit(1);
    };
    defer main_fn.deinit(allocator);

    // Initialize module contexts
    module_cache = std.StringHashMap(Value).init(allocator);
    defer {
        var mit = module_cache.iterator();
        while (mit.next()) |entry| {
            allocator.free(entry.key_ptr.*);
            release(allocator, entry.value_ptr.*);
        }
        module_cache.deinit();
    }

    active_imports = std.StringHashMap(void).init(allocator);
    defer active_imports.deinit();

    loaded_functions = std.ArrayList(*value_mod.HkdFunction).empty;
    defer {
        for (loaded_functions.items) |func| {
            func.deinit(allocator);
        }
        loaded_functions.deinit(allocator);
    }

    const target_path = file_path_opt orelse ".";
    const resolved_file_path = try std.fs.path.resolve(allocator, &[_][]const u8{target_path});
    defer allocator.free(resolved_file_path);
    root_file_dir = try allocator.dupe(u8, std.fs.path.dirname(resolved_file_path) orelse ".");
    defer allocator.free(root_file_dir);

    // Setup and execute VM
    var vm = VM.init(allocator);
    defer vm.deinit();

    // Register module loaders
    if (vm.globals.getEntry("__import__")) |entry| {
        entry.value_ptr.* = Value{ .Native = nativeImport };
    } else {
        try vm.globals.put(try allocator.dupe(u8, "__import__"), Value{ .Native = nativeImport });
    }

    current_vm = &vm;
    defer current_vm = null;

    var jit_mgr = jit.JITManager.init(allocator);
    defer jit_mgr.deinit();
    jit_mgr.is_enabled = enable_jit;

    if (enable_profiler) {
        profiler.initGlobalProfiler(allocator);
        profiler.global_profiler.enabled = true;
        profiler.global_profiler.output_path = profile_output_path;
    }
    defer {
        if (enable_profiler) {
            profiler.deinitGlobalProfiler();
        }
    }

    const result = vm.run(main_fn) catch {
        std.process.exit(1);
    };
    release(allocator, result);

    if (enable_profiler) {
        var prof_buf: [32768]u8 = undefined;
        var bw = profiler.BufferWriter{ .buf = &prof_buf };
        profiler.global_profiler.writeJson(&bw) catch {};
        const json_data = bw.getWritten();

        if (profile_output_path) |out_p| {
            const out_file = std.Io.Dir.createFile(.cwd(), global_io, out_p, .{}) catch null;
            if (out_file) |f| {
                defer f.close(global_io);
                _ = f.writePositionalAll(global_io, json_data, 0) catch {};
            }
        } else {
            std.debug.print("\n=== HKD Runtime Profile ===\n{s}\n", .{json_data});
        }
    }

    if (show_jit_stats) {
        std.debug.print("\n=== HKD JIT Engine Statistics ===\n", .{});
        std.debug.print("JIT Mode: Multi-Tier Enabled (W^X Protected Memory)\n", .{});
        std.debug.print("Tier 0 (Stack VM): Active Fallback\n", .{});
        std.debug.print("Tier 1 (Baseline JIT): {d} compiled\n", .{jit_mgr.tier1_compiled});
        std.debug.print("Tier 2 (Optimizing JIT): {d} compiled\n", .{jit_mgr.tier2_compiled});
        std.debug.print("Tier 3 (PGO JIT): {d} compiled\n", .{jit_mgr.tier3_compiled});
        std.debug.print("Total Deoptimizations: {d} (Clean Fallback)\n", .{jit_mgr.total_deopts});
        std.debug.print("Status: Active\n\n", .{});
    }
}
