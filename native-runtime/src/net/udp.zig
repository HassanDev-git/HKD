const std = @import("std");
const buffer_mod = @import("../buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;

pub const UdpSocket = struct {
    port: u16,
    is_closed: bool = false,

    pub fn bind(host: []const u8, port: u16) !UdpSocket {
        _ = host;
        return UdpSocket{ .port = port, .is_closed = false };
    }

    pub fn sendTo(self: *UdpSocket, host: []const u8, port: u16, data: []const u8) !usize {
        if (self.is_closed) return error.SocketClosed;
        _ = host;
        _ = port;
        return data.len;
    }

    pub fn receiveFrom(self: *UdpSocket, buf: *Buffer, max_bytes: usize) !usize {
        if (self.is_closed) return error.SocketClosed;
        try buf.ensureCapacity(max_bytes);
        return 0;
    }

    pub fn close(self: *UdpSocket) void {
        self.is_closed = true;
    }
};
