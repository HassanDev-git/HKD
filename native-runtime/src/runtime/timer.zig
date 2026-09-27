const std = @import("std");
const task_mod = @import("task.zig");
const TaskId = task_mod.TaskId;

pub const TimerId = u64;

pub const Timer = struct {
    id: TimerId,
    task_id: TaskId,
    deadline_ms: i64,
    cancelled: bool = false,
};

pub const TimerQueue = struct {
    allocator: std.mem.Allocator,
    timers: std.ArrayList(Timer),
    next_id: TimerId = 1,

    pub fn init(allocator: std.mem.Allocator) TimerQueue {
        return .{
            .allocator = allocator,
            .timers = std.ArrayList(Timer).empty,
            .next_id = 1,
        };
    }

    pub fn deinit(self: *TimerQueue) void {
        self.timers.deinit(self.allocator);
    }

    pub fn addTimer(self: *TimerQueue, task_id: TaskId, delay_ms: i64) !TimerId {
        const id = self.next_id;
        self.next_id += 1;
        const now = std.time.milliTimestamp();
        const deadline = now + delay_ms;
        try self.timers.append(self.allocator, .{
            .id = id,
            .task_id = task_id,
            .deadline_ms = deadline,
            .cancelled = false,
        });
        return id;
    }

    pub fn cancelTimer(self: *TimerQueue, id: TimerId) void {
        for (self.timers.items) |*t| {
            if (t.id == id) {
                t.cancelled = true;
                break;
            }
        }
    }

    /// Returns the millisecond timeout until the next timer expires, or null if no active timers.
    pub fn getNextTimeoutMs(self: *const TimerQueue) ?u32 {
        const now = std.time.milliTimestamp();
        var min_wait: ?i64 = null;
        for (self.timers.items) |t| {
            if (t.cancelled) continue;
            const diff = t.deadline_ms - now;
            const wait = if (diff < 0) 0 else diff;
            if (min_wait == null or wait < min_wait.?) {
                min_wait = wait;
            }
        }
        if (min_wait) |w| {
            if (w > std.math.maxInt(u32)) return std.math.maxInt(u32);
            return @as(u32, @intCast(w));
        }
        return null;
    }

    /// Collects expired task IDs into expired_tasks list and removes them from timer queue.
    pub fn pollExpired(self: *TimerQueue, expired_tasks: *std.ArrayList(TaskId)) !void {
        const now = std.time.milliTimestamp();
        var i: usize = 0;
        while (i < self.timers.items.len) {
            const t = self.timers.items[i];
            if (t.cancelled) {
                _ = self.timers.swapRemove(i);
                continue;
            }
            if (t.deadline_ms <= now) {
                try expired_tasks.append(self.allocator, t.task_id);
                _ = self.timers.swapRemove(i);
            } else {
                i += 1;
            }
        }
    }
};
