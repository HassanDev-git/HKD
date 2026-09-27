const std = @import("std");
const buffer_mod = @import("../buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;

pub const TcpStream = struct {
    handle: usize = 0,
    is_closed: bool = false,

    pub fn read(self: *TcpStream, buf: *Buffer, max_bytes: usize) !usize {
        if (self.is_closed) return error.SocketClosed;
        try buf.ensureCapacity(max_bytes);
        return 0;
    }

    pub fn write(self: *TcpStream, data: []const u8) !usize {
        if (self.is_closed) return error.SocketClosed;
        return data.len;
    }

    pub fn writeAll(self: *TcpStream, data: []const u8) !void {
        if (self.is_closed) return error.SocketClosed;
        _ = data;
    }

    pub fn close(self: *TcpStream) void {
        self.is_closed = true;
    }
};

pub const TcpListener = struct {
    port: u16,
    is_closed: bool = false,

    pub fn init(host: []const u8, port: u16) !TcpListener {
        _ = host;
        return TcpListener{ .port = port, .is_closed = false };
    }

    pub fn accept(self: *TcpListener) !TcpStream {
        if (self.is_closed) return error.SocketClosed;
        return TcpStream{ .handle = 1, .is_closed = false };
    }

    pub fn close(self: *TcpListener) void {
        self.is_closed = true;
    }
};

pub fn connect(host: []const u8, port: u16) !TcpStream {
    _ = host;
    _ = port;
    return TcpStream{ .handle = 1, .is_closed = false };
}
