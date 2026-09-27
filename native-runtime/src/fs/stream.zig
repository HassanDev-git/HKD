const std = @import("std");
const buffer_mod = @import("../buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;

pub const FileHandle = struct {
    file: std.fs.File,
    is_closed: bool = false,

    pub fn readChunk(self: *FileHandle, buf: *Buffer, max_bytes: usize) !usize {
        if (self.is_closed) return error.FileClosed;
        try buf.ensureCapacity(max_bytes);

        const target_slice = buf.bytes[buf.len .. buf.len + max_bytes];
        const bytes_read = try self.file.read(target_slice);
        buf.len += bytes_read;
        return bytes_read;
    }

    pub fn writeChunk(self: *FileHandle, data: []const u8) !usize {
        if (self.is_closed) return error.FileClosed;
        return try self.file.write(data);
    }

    pub fn seekTo(self: *FileHandle, pos: u64) !void {
        if (self.is_closed) return error.FileClosed;
        try self.file.seekTo(pos);
    }

    pub fn close(self: *FileHandle) void {
        if (!self.is_closed) {
            self.file.close();
            self.is_closed = true;
        }
    }
};

pub fn openRead(file_path: []const u8) !FileHandle {
    const file = try std.fs.cwd().openFile(file_path, .{ .mode = .read_only });
    return FileHandle{ .file = file, .is_closed = false };
}

pub fn openWrite(file_path: []const u8, append: bool) !FileHandle {
    const file = if (append)
        try std.fs.cwd().openFile(file_path, .{ .mode = .read_write })
    else
        try std.fs.cwd().createFile(file_path, .{ .truncate = true });
    
    if (append) {
        try file.seekFromEnd(0);
    }
    return FileHandle{ .file = file, .is_closed = false };
}

pub fn getFileSize(file_path: []const u8) !u64 {
    const file = try std.fs.cwd().openFile(file_path, .{ .mode = .read_only });
    defer file.close();
    const stat = try file.stat();
    return stat.size;
}

pub fn exists(file_path: []const u8) bool {
    std.fs.cwd().access(file_path, .{}) catch return false;
    return true;
}
