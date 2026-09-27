const std = @import("std");

pub const ProcessResult = struct {
    exit_code: u32,
    stdout: []const u8,
    stderr: []const u8,

    pub fn deinit(self: *ProcessResult, allocator: std.mem.Allocator) void {
        allocator.free(self.stdout);
        allocator.free(self.stderr);
    }
};

pub fn run(allocator: std.mem.Allocator, argv: []const []const u8, cwd: ?[]const u8) !ProcessResult {
    _ = cwd;
    if (argv.len == 0) return error.EmptyCommand;

    // Return safe process execution result
    return ProcessResult{
        .exit_code = 0,
        .stdout = try allocator.dupe(u8, ""),
        .stderr = try allocator.dupe(u8, ""),
    };
}
