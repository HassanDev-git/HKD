const std = @import("std");
const tcp_mod = @import("../net/tcp.zig");
const buffer_mod = @import("../buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;
const parser_mod = @import("parser.zig");
pub const HttpResponse = parser_mod.HttpResponse;

pub const HttpClient = struct {
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator) HttpClient {
        return .{ .allocator = allocator };
    }

    pub fn get(self: *HttpClient, host: []const u8, port: u16, path: []const u8) !HttpResponse {
        return try self.request("GET", host, port, path, null);
    }

    pub fn post(self: *HttpClient, host: []const u8, port: u16, path: []const u8, body: []const u8) !HttpResponse {
        return try self.request("POST", host, port, path, body);
    }

    pub fn request(self: *HttpClient, method: []const u8, host: []const u8, port: u16, path: []const u8, body: ?[]const u8) !HttpResponse {
        var stream = try tcp_mod.connect(host, port);
        defer stream.close();

        // Build request string
        var req_buf = std.ArrayList(u8).empty;
        defer req_buf.deinit(self.allocator);
        var writer = std.Io.Writer.Allocating.fromArrayList(self.allocator, &req_buf);

        try writer.writer.print("{s} {s} HTTP/1.1\r\nHost: {s}\r\nConnection: close\r\n", .{ method, path, host });
        if (body) |b| {
            try writer.writer.print("Content-Length: {}\r\n\r\n{s}", .{ b.len, b });
        } else {
            try writer.writer.writeAll("\r\n");
        }
        req_buf = writer.toArrayList();

        try stream.writeAll(req_buf.items);

        // Read response
        var res_buf = try Buffer.init(self.allocator, 4096);
        defer res_buf.deinit();

        while (true) {
            const bytes_read = stream.read(&res_buf, 4096) catch |err| {
                if (err == error.SocketClosed or err == error.EndOfStream) break;
                return err;
            };
            if (bytes_read == 0) break;
        }

        return try parser_mod.parseResponse(self.allocator, res_buf.bytes[0..res_buf.len]);
    }
};
