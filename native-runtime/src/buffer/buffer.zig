const std = @import("std");

pub const Buffer = struct {
    allocator: std.mem.Allocator,
    bytes: []u8,
    len: usize,
    capacity: usize,

    pub fn init(allocator: std.mem.Allocator, initial_capacity: usize) !Buffer {
        const cap = if (initial_capacity < 16) 16 else initial_capacity;
        const bytes = try allocator.alloc(u8, cap);
        return Buffer{
            .allocator = allocator,
            .bytes = bytes,
            .len = 0,
            .capacity = cap,
        };
    }

    pub fn fromSlice(allocator: std.mem.Allocator, data: []const u8) !Buffer {
        var buf = try Buffer.init(allocator, data.len);
        @memcpy(buf.bytes[0..data.len], data);
        buf.len = data.len;
        return buf;
    }

    pub fn deinit(self: *Buffer) void {
        self.allocator.free(self.bytes);
        self.bytes = &[_]u8{};
        self.len = 0;
        self.capacity = 0;
    }

    pub fn ensureCapacity(self: *Buffer, additional: usize) !void {
        const required = self.len + additional;
        if (required <= self.capacity) return;

        var new_cap = self.capacity * 2;
        if (new_cap < required) new_cap = required;

        const new_bytes = try self.allocator.alloc(u8, new_cap);
        @memcpy(new_bytes[0..self.len], self.bytes[0..self.len]);
        self.allocator.free(self.bytes);
        self.bytes = new_bytes;
        self.capacity = new_cap;
    }

    pub fn append(self: *Buffer, data: []const u8) !void {
        try self.ensureCapacity(data.len);
        @memcpy(self.bytes[self.len .. self.len + data.len], data);
        self.len += data.len;
    }

    pub fn appendByte(self: *Buffer, b: u8) !void {
        try self.ensureCapacity(1);
        self.bytes[self.len] = b;
        self.len += 1;
    }

    pub fn slice(self: *const Buffer, start: usize, end: usize) ![]const u8 {
        if (start > end or end > self.len) return error.OutOfBounds;
        return self.bytes[start..end];
    }

    pub fn readU8(self: *const Buffer, offset: usize) !u8 {
        if (offset >= self.len) return error.OutOfBounds;
        return self.bytes[offset];
    }

    pub fn writeU8(self: *Buffer, offset: usize, val: u8) !void {
        if (offset >= self.len) return error.OutOfBounds;
        self.bytes[offset] = val;
    }

    pub fn readU16BE(self: *const Buffer, offset: usize) !u16 {
        if (offset + 2 > self.len) return error.OutOfBounds;
        return std.mem.readInt(u16, self.bytes[offset .. offset + 2][0..2], .big);
    }

    pub fn writeU16BE(self: *Buffer, offset: usize, val: u16) !void {
        if (offset + 2 > self.len) return error.OutOfBounds;
        std.mem.writeInt(u16, self.bytes[offset .. offset + 2][0..2], val, .big);
    }

    pub fn readU32BE(self: *const Buffer, offset: usize) !u32 {
        if (offset + 4 > self.len) return error.OutOfBounds;
        return std.mem.readInt(u32, self.bytes[offset .. offset + 4][0..4], .big);
    }

    pub fn writeU32BE(self: *Buffer, offset: usize, val: u32) !void {
        if (offset + 4 > self.len) return error.OutOfBounds;
        std.mem.writeInt(u32, self.bytes[offset .. offset + 4][0..4], val, .big);
    }

    pub fn readI32BE(self: *const Buffer, offset: usize) !i32 {
        if (offset + 4 > self.len) return error.OutOfBounds;
        return std.mem.readInt(i32, self.bytes[offset .. offset + 4][0..4], .big);
    }

    pub fn writeI32BE(self: *Buffer, offset: usize, val: i32) !void {
        if (offset + 4 > self.len) return error.OutOfBounds;
        std.mem.writeInt(i32, self.bytes[offset .. offset + 4][0..4], val, .big);
    }

    pub fn readU64BE(self: *const Buffer, offset: usize) !u64 {
        if (offset + 8 > self.len) return error.OutOfBounds;
        return std.mem.readInt(u64, self.bytes[offset .. offset + 8][0..8], .big);
    }

    pub fn writeU64BE(self: *Buffer, offset: usize, val: u64) !void {
        if (offset + 8 > self.len) return error.OutOfBounds;
        std.mem.writeInt(u64, self.bytes[offset .. offset + 8][0..8], val, .big);
    }

    pub fn readF64BE(self: *const Buffer, offset: usize) !f64 {
        const u = try self.readU64BE(offset);
        return @bitCast(u);
    }

    pub fn writeF64BE(self: *Buffer, offset: usize, val: f64) !void {
        const u: u64 = @bitCast(val);
        try self.writeU64BE(offset, u);
    }

    pub fn toUtf8String(self: *const Buffer, allocator: std.mem.Allocator) ![]const u8 {
        return try allocator.dupe(u8, self.bytes[0..self.len]);
    }
};
