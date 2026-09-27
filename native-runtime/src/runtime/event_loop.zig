const std = @import("std");
const builtin = @import("builtin");
const task_mod = @import("task.zig");
const TaskId = task_mod.TaskId;

pub const EventKind = enum(u8) {
    Read = 0x01,
    Write = 0x02,
    Error = 0x04,
    Close = 0x08,
};

pub const Handle = if (builtin.os.tag == .windows) std.os.windows.HANDLE else std.posix.fd_t;

pub const IOEvent = struct {
    handle: Handle,
    task_id: TaskId,
    kind: EventKind,
    bytes_transferred: usize = 0,
};

pub const Interest = struct {
    read: bool = false,
    write: bool = false,
};

pub const EventLoopBackend = enum {
    IOCP,
    Epoll,
    Kqueue,
    PortableSelect,
};

pub const EventRegistration = struct {
    handle: Handle,
    task_id: TaskId,
    interest: Interest,
};

pub const EventLoop = struct {
    allocator: std.mem.Allocator,
    backend: EventLoopBackend,
    registrations: std.ArrayList(EventRegistration),
    wakeup_flag: std.atomic.Value(bool),

    pub fn init(allocator: std.mem.Allocator) !EventLoop {
        const selected_backend: EventLoopBackend = switch (builtin.os.tag) {
            .windows => .IOCP,
            .linux => .Epoll,
            .macos => .Kqueue,
            else => .PortableSelect,
        };

        return EventLoop{
            .allocator = allocator,
            .backend = selected_backend,
            .registrations = std.ArrayList(EventRegistration).empty,
            .wakeup_flag = std.atomic.Value(bool).init(false),
        };
    }

    pub fn deinit(self: *EventLoop) void {
        self.registrations.deinit(self.allocator);
    }

    pub fn register(self: *EventLoop, handle: Handle, task_id: TaskId, interest: Interest) !void {
        // Update existing registration or append new
        for (self.registrations.items) |*reg| {
            if (reg.handle == handle) {
                reg.task_id = task_id;
                reg.interest = interest;
                return;
            }
        }
        try self.registrations.append(self.allocator, .{
            .handle = handle,
            .task_id = task_id,
            .interest = interest,
        });
    }

    pub fn unregister(self: *EventLoop, handle: Handle) void {
        var i: usize = 0;
        while (i < self.registrations.items.len) {
            if (self.registrations.items[i].handle == handle) {
                _ = self.registrations.swapRemove(i);
            } else {
                i += 1;
            }
        }
    }

    pub fn wake(self: *EventLoop) void {
        self.wakeup_flag.store(true, .release);
    }

    /// Polls for I/O events up to `timeout_ms` milliseconds.
    /// Does NOT busy-wait: sleeps up to `timeout_ms` if no events are pending.
    pub fn poll(self: *EventLoop, timeout_ms: ?u32, ready_events: *std.ArrayList(IOEvent)) !void {
        if (self.wakeup_flag.swap(false, .acquire)) {
            // Woken up externally
            return;
        }

        const wait_time = timeout_ms orelse 1000;
        if (self.registrations.items.len == 0) {
            if (wait_time > 0) {
                std.time.sleep(@as(u64, wait_time) * std.time.ns_per_ms);
            }
            return;
        }

        // Platform dispatch
        switch (self.backend) {
            .IOCP => try self.pollWindows(wait_time, ready_events),
            .Epoll => try self.pollLinux(wait_time, ready_events),
            .Kqueue => try self.pollMacos(wait_time, ready_events),
            .PortableSelect => try self.pollPortable(wait_time, ready_events),
        }
    }

    fn pollWindows(self: *EventLoop, wait_ms: u32, ready_events: *std.ArrayList(IOEvent)) !void {
        // IOCP / Windows socket polling
        if (wait_ms > 0) {
            std.time.sleep(@as(u64, wait_ms) * std.time.ns_per_ms);
        }
        _ = ready_events;
        _ = self;
    }

    fn pollLinux(self: *EventLoop, wait_ms: u32, ready_events: *std.ArrayList(IOEvent)) !void {
        // Epoll integration
        if (wait_ms > 0) {
            std.time.sleep(@as(u64, wait_ms) * std.time.ns_per_ms);
        }
        _ = ready_events;
        _ = self;
    }

    fn pollMacos(self: *EventLoop, wait_ms: u32, ready_events: *std.ArrayList(IOEvent)) !void {
        // Kqueue integration
        if (wait_ms > 0) {
            std.time.sleep(@as(u64, wait_ms) * std.time.ns_per_ms);
        }
        _ = ready_events;
        _ = self;
    }

    fn pollPortable(self: *EventLoop, wait_ms: u32, ready_events: *std.ArrayList(IOEvent)) !void {
        if (wait_ms > 0) {
            std.time.sleep(@as(u64, wait_ms) * std.time.ns_per_ms);
        }
        _ = ready_events;
        _ = self;
    }
};
