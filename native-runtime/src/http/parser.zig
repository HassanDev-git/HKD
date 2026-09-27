const std = @import("std");

pub const HttpRequest = struct {
    method: []const u8,
    path: []const u8,
    headers: std.StringHashMap([]const u8),
    body: []const u8,

    pub fn deinit(self: *HttpRequest) void {
        self.headers.deinit();
    }
};

pub const HttpResponse = struct {
    status_code: u16,
    status_text: []const u8,
    headers: std.StringHashMap([]const u8),
    body: []const u8,

    pub fn deinit(self: *HttpResponse) void {
        self.headers.deinit();
    }
};

pub fn parseRequest(allocator: std.mem.Allocator, raw: []const u8) !HttpRequest {
    // Max header limit to prevent header-overflow attacks
    if (raw.len > 65536) return error.RequestTooLarge;

    var header_end = std.mem.indexOf(u8, raw, "\r\n\r\n");
    var delimiter_len: usize = 4;
    if (header_end == null) {
        header_end = std.mem.indexOf(u8, raw, "\n\n");
        delimiter_len = 2;
    }
    if (header_end == null) return error.IncompleteRequest;

    const headers_part = raw[0..header_end.?];
    const body_part = raw[header_end.? + delimiter_len ..];

    var line_it = std.mem.splitSequence(u8, headers_part, "\n");
    const first_line = std.mem.trim(u8, line_it.first(), "\r");

    var part_it = std.mem.splitScalar(u8, first_line, ' ');
    const method = part_it.first();
    const path = part_it.next() orelse return error.MalformedRequest;

    var headers = std.StringHashMap([]const u8).init(allocator);
    errdefer headers.deinit();

    while (line_it.next()) |line_raw| {
        const line = std.mem.trim(u8, line_raw, "\r");
        if (line.len == 0) continue;
        const colon_idx = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const key = std.mem.trim(u8, line[0..colon_idx], " \t");
        const val = std.mem.trim(u8, line[colon_idx + 1 ..], " \t");
        try headers.put(key, val);
    }

    return HttpRequest{
        .method = method,
        .path = path,
        .headers = headers,
        .body = body_part,
    };
}

pub fn parseResponse(allocator: std.mem.Allocator, raw: []const u8) !HttpResponse {
    var header_end = std.mem.indexOf(u8, raw, "\r\n\r\n");
    var delimiter_len: usize = 4;
    if (header_end == null) {
        header_end = std.mem.indexOf(u8, raw, "\n\n");
        delimiter_len = 2;
    }
    if (header_end == null) return error.IncompleteResponse;

    const headers_part = raw[0..header_end.?];
    const body_part = raw[header_end.? + delimiter_len ..];

    var line_it = std.mem.splitSequence(u8, headers_part, "\n");
    const first_line = std.mem.trim(u8, line_it.first(), "\r");

    var part_it = std.mem.splitScalar(u8, first_line, ' ');
    _ = part_it.first(); // Protocol HTTP/1.1
    const status_str = part_it.next() orelse return error.MalformedResponse;
    const status_code = try std.fmt.parseInt(u16, status_str, 10);
    const status_text = part_it.rest();

    var headers = std.StringHashMap([]const u8).init(allocator);
    errdefer headers.deinit();

    while (line_it.next()) |line_raw| {
        const line = std.mem.trim(u8, line_raw, "\r");
        if (line.len == 0) continue;
        const colon_idx = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const key = std.mem.trim(u8, line[0..colon_idx], " \t");
        const val = std.mem.trim(u8, line[colon_idx + 1 ..], " \t");
        try headers.put(key, val);
    }

    return HttpResponse{
        .status_code = status_code,
        .status_text = status_text,
        .headers = headers,
        .body = body_part,
    };
}
