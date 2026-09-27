const std = @import("std");
const builtin = @import("builtin");

// Windows kernel32 dynamic library bindings
extern "kernel32" fn LoadLibraryA(lpLibFileName: [*:0]const u8) callconv(.winapi) ?std.os.windows.HMODULE;
extern "kernel32" fn GetProcAddress(hModule: std.os.windows.HMODULE, lpProcName: [*:0]const u8) callconv(.winapi) ?*const anyopaque;
extern "kernel32" fn FreeLibrary(hLibModule: std.os.windows.HMODULE) callconv(.winapi) std.os.windows.BOOL;

pub const DynamicLibrary = struct {
    handle: ?*anyopaque,
    path: []const u8,
    is_closed: bool = false,

    pub fn open(file_path: []const u8) !DynamicLibrary {
        if (builtin.os.tag == .windows) {
            // Null-terminate path for Win32
            var buf: [512]u8 = undefined;
            if (file_path.len >= buf.len) return error.NameTooLong;
            @memcpy(buf[0..file_path.len], file_path);
            buf[file_path.len] = 0;
            const null_term: [*:0]const u8 = @ptrCast(buf[0..file_path.len]);

            const h = LoadLibraryA(null_term);
            if (h == null) return error.LibraryNotFound;
            return DynamicLibrary{
                .handle = @ptrCast(h.?),
                .path = file_path,
                .is_closed = false,
            };
        } else {
            return error.UnsupportedPlatform;
        }
    }

    pub fn lookup(self: *DynamicLibrary, comptime T: type, symbol_name: [:0]const u8) ?T {
        if (self.is_closed or self.handle == null) return null;
        if (builtin.os.tag == .windows) {
            const h: std.os.windows.HMODULE = @ptrCast(self.handle.?);
            const sym = GetProcAddress(h, symbol_name);
            if (sym == null) return null;
            return @ptrCast(sym.?);
        }
        return null;
    }

    pub fn close(self: *DynamicLibrary) void {
        if (!self.is_closed) {
            if (builtin.os.tag == .windows and self.handle != null) {
                const h: std.os.windows.HMODULE = @ptrCast(self.handle.?);
                _ = FreeLibrary(h);
            }
            self.handle = null;
            self.is_closed = true;
        }
    }
};
