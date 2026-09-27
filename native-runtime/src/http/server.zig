const std = @import("std");
const tcp_mod = @import("../net/tcp.zig");
const buffer_mod = @import("../buffer/buffer.zig");
const Buffer = buffer_mod.Buffer;
const parser_mod = @import("parser.zig");
pub const HttpRequest = parser_mod.HttpRequest;

pub const RouteHandler = *const fn (allocator: std.mem.Allocator, req: *const HttpRequest) anyerror!ServerResponse;

pub const ServerResponse = struct {
    status_code: u16 = 200,
    content_type: []const u8 = "text/plain",
    body: []const u8 = "",
};

pub const HttpServer = struct {
    allocator: std.mem.Allocator,
    listener: ?tcp_mod.TcpListener = null,
    routes: std.StringHashMap(RouteHandler),
    is_running: bool = false,

    pub fn init(allocator: std.mem.Allocator) HttpServer {
        return .{
            .allocator = allocator,
            .listener = null,
            .routes = std.StringHashMap(RouteHandler).init(allocator),
            .is_running = false,
        };
    }

    pub fn deinit(self: *HttpServer) void {
        self.stop();
        self.routes.deinit();
    }

    pub fn route(self: *HttpServer, path: []const u8, handler: RouteHandler) !void {
        try self.routes.put(path, handler);
    }

    pub fn listen(self: *HttpServer, host: []const u8, port: u16) !void {
        self.listener = try tcp_mod.TcpListener.init(host, port);
        self.is_running = true;
    }

    /// Handles a single incoming HTTP connection synchronously or in task scheduler
    pub fn handleOne(self: *HttpServer) !void {
        if (self.listener == null) return error.NotListening;
        var stream = try self.listener.?.accept();
        defer stream.close();

        var req_buf = try Buffer.init(self.allocator, 2048);
        defer req_buf.deinit();

        // Read request (capped to 65536 bytes to prevent header/memory exhaustion attacks)
        const bytes_read = try stream.read(&req_buf, 65536);
        if (bytes_read == 0) return;

        var req = parser_mod.parseRequest(self.allocator, req_buf.bytes[0..req_buf.len]) catch |err| {
            // Send 400 Bad Request
            try stream.writeAll("HTTP/1.1 400 Bad Request\r\nContent-Length: 11\r\n\r\nBad Request");
            return err;
        };
        defer req.deinit();

        // Match route
        var resp = ServerResponse{ .status_code = 404, .body = "Not Found" };
        if (self.routes.get(req.path)) |handler| {
            resp = handler(self.allocator, &req) catch ServerResponse{ .status_code = 500, .body = "Internal Server Error" };
        }

        // Format and send response
        var res_bytes = std.ArrayList(u8).empty;
        defer res_bytes.deinit(self.allocator);
        var writer = std.Io.Writer.Allocating.fromArrayList(self.allocator, &res_bytes);

        const status_text = switch (resp.status_code) {
            200 => "OK",
            201 => "Created",
            400 => "Bad Request",
            404 => "Not Found",
            500 => "Internal Server Error",
            else => "OK",
        };

        try writer.writer.print("HTTP/1.1 {} {s}\r\nContent-Type: {s}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{s}", .{
            resp.status_code,
            status_text,
            resp.content_type,
            resp.body.len,
            resp.body,
        });
        res_bytes = writer.toArrayList();

        try stream.writeAll(res_bytes.items);
    }

    pub fn stop(self: *HttpServer) void {
        if (self.listener) |*l| {
            l.close();
            self.listener = null;
        }
        self.is_running = false;
    }
};
