const std = @import("std");
const builtin = @import("builtin");

fn sleepMs(ms: u32) void {
    if (comptime builtin.os.tag == .windows) {
        const kernel32 = struct {
            extern "kernel32" fn Sleep(dwMilliseconds: u32) callconv(.winapi) void;
        };
        kernel32.Sleep(ms);
    } else {
        var ts = std.posix.timespec{
            .sec = @intCast(ms / 1000),
            .nsec = @intCast((ms % 1000) * 1_000_000),
        };
        _ = std.posix.nanosleep(&ts, null);
    }
}

pub const Job = struct {
    run_fn: *const fn (ctx: ?*anyopaque) void,
    ctx: ?*anyopaque,
};

pub const SpinLock = struct {
    state: std.atomic.Value(bool) = std.atomic.Value(bool).init(false),

    pub fn lock(self: *SpinLock) void {
        while (self.state.cmpxchgWeak(false, true, .acquire, .monotonic) != null) {
            std.atomic.spinLoopHint();
        }
    }

    pub fn unlock(self: *SpinLock) void {
        self.state.store(false, .release);
    }
};

pub const WorkerPool = struct {
    allocator: std.mem.Allocator,
    threads: []std.Thread,
    queue: std.ArrayList(Job),
    lock: SpinLock = .{},
    stopping: bool = false,

    pub fn init(allocator: std.mem.Allocator, thread_count: usize) !*WorkerPool {
        const pool = try allocator.create(WorkerPool);
        errdefer allocator.destroy(pool);

        const count = if (thread_count == 0) 2 else thread_count;
        const threads = try allocator.alloc(std.Thread, count);
        errdefer allocator.free(threads);

        pool.* = .{
            .allocator = allocator,
            .threads = threads,
            .queue = std.ArrayList(Job).empty,
            .lock = .{},
            .stopping = false,
        };

        var started: usize = 0;
        errdefer {
            pool.lock.lock();
            pool.stopping = true;
            pool.lock.unlock();
            for (pool.threads[0..started]) |t| {
                t.join();
            }
        }

        for (0..count) |i| {
            pool.threads[i] = try std.Thread.spawn(.{}, workerLoop, .{pool});
            started += 1;
        }

        return pool;
    }

    pub fn post(self: *WorkerPool, run_fn: *const fn (ctx: ?*anyopaque) void, ctx: ?*anyopaque) !void {
        self.lock.lock();
        defer self.lock.unlock();

        if (self.stopping) return error.PoolStopping;
        try self.queue.append(self.allocator, Job{ .run_fn = run_fn, .ctx = ctx });
    }

    fn workerLoop(self: *WorkerPool) void {
        while (true) {
            var job: ?Job = null;
            {
                self.lock.lock();
                defer self.lock.unlock();

                if (self.queue.items.len > 0) {
                    job = self.queue.orderedRemove(0);
                } else if (self.stopping) {
                    return;
                }
            }

            if (job) |j| {
                j.run_fn(j.ctx);
            } else {
                sleepMs(1);
            }
        }
    }

    pub fn deinit(self: *WorkerPool) void {
        {
            self.lock.lock();
            self.stopping = true;
            self.lock.unlock();
        }

        for (self.threads) |t| {
            t.join();
        }

        self.queue.deinit(self.allocator);
        self.allocator.free(self.threads);
        self.allocator.destroy(self);
    }
};

test "WorkerPool concurrent execution" {
    const testing = std.testing;
    const allocator = testing.allocator;

    const Context = struct {
        counter: *std.atomic.Value(usize),
        fn run(ctx_ptr: ?*anyopaque) void {
            const self: *@This() = @alignCast(@ptrCast(ctx_ptr.?));
            _ = self.counter.fetchAdd(1, .seq_cst);
        }
    };

    var counter = std.atomic.Value(usize).init(0);
    var pool = try WorkerPool.init(allocator, 4);
    defer pool.deinit();

    var contexts: [20]Context = undefined;
    for (0..20) |i| {
        contexts[i] = .{ .counter = &counter };
        try pool.post(Context.run, &contexts[i]);
    }

    // Wait until all 20 jobs are executed
    var attempts: usize = 0;
    while (counter.load(.seq_cst) < 20 and attempts < 100) : (attempts += 1) {
        sleepMs(10);
    }

    try testing.expectEqual(@as(usize, 20), counter.load(.seq_cst));
}
