const std = @import("std");
const vm_mod = @import("../vm.zig");
const VM = vm_mod.VM;
const CallFrame = vm_mod.CallFrame;
const value_mod = @import("../value.zig");
const Value = value_mod.Value;
const HkdFunction = value_mod.HkdFunction;
const release = value_mod.release;

const task_mod = @import("task.zig");
pub const Task = task_mod.Task;
pub const TaskId = task_mod.TaskId;
pub const TaskState = task_mod.TaskState;
pub const CancellationToken = task_mod.CancellationToken;

const timer_mod = @import("timer.zig");
pub const TimerQueue = timer_mod.TimerQueue;

const event_loop_mod = @import("event_loop.zig");
pub const EventLoop = event_loop_mod.EventLoop;
pub const IOEvent = event_loop_mod.IOEvent;

const worker_pool_mod = @import("worker_pool.zig");
pub const WorkerPool = worker_pool_mod.WorkerPool;

pub const Scheduler = struct {
    allocator: std.mem.Allocator,
    vm: *VM,
    tasks: std.ArrayList(*Task),
    ready_queue: std.ArrayList(*Task),
    timer_queue: TimerQueue,
    event_loop: EventLoop,
    worker_pool: ?*WorkerPool = null,
    next_task_id: TaskId = 1,
    current_task: ?*Task = null,

    pub fn init(allocator: std.mem.Allocator, vm: *VM) !Scheduler {
        return Scheduler{
            .allocator = allocator,
            .vm = vm,
            .tasks = std.ArrayList(*Task).empty,
            .ready_queue = std.ArrayList(*Task).empty,
            .timer_queue = TimerQueue.init(allocator),
            .event_loop = try EventLoop.init(allocator),
            .worker_pool = null,
            .next_task_id = 1,
            .current_task = null,
        };
    }

    pub fn getWorkerPool(self: *Scheduler) !*WorkerPool {
        if (self.worker_pool == null) {
            self.worker_pool = try WorkerPool.init(self.allocator, 4);
        }
        return self.worker_pool.?;
    }

    pub fn deinit(self: *Scheduler) void {
        if (self.worker_pool) |p| {
            p.deinit();
            self.worker_pool = null;
        }
        for (self.tasks.items) |t| {
            // Free any remaining stack values in task context
            while (t.context.stack_top > 0) {
                t.context.stack_top -= 1;
                release(self.allocator, t.context.stack[t.context.stack_top]);
            }
            self.allocator.destroy(t);
        }
        self.tasks.deinit(self.allocator);
        self.ready_queue.deinit(self.allocator);
        self.timer_queue.deinit();
        self.event_loop.deinit();
    }

    pub fn spawn(self: *Scheduler, main_fn: *HkdFunction) !*Task {
        const id = self.next_task_id;
        self.next_task_id += 1;

        const task = try self.allocator.create(Task);
        task.* = Task.init(id);

        // Setup entry frame
        task.context.stack[0] = Value{ .Function = main_fn };
        task.context.stack_top = 1;
        value_mod.retain(task.context.stack[0]);

        task.context.frames[0] = CallFrame{
            .function = main_fn,
            .closure = null,
            .ip = 0,
            .base = 1,
        };
        task.context.frame_count = 1;

        try self.tasks.append(self.allocator, task);
        try self.ready_queue.append(self.allocator, task);
        return task;
    }

    pub fn hasActiveTasks(self: *const Scheduler) bool {
        for (self.tasks.items) |t| {
            if (t.state == .Ready or t.state == .Running or t.state == .Waiting) {
                return true;
            }
        }
        return false;
    }

    pub fn hasWaitingTasks(self: *const Scheduler) bool {
        for (self.tasks.items) |t| {
            if (t.state == .Waiting) return true;
        }
        return false;
    }

    pub fn wakeTask(self: *Scheduler, task_id: TaskId, result: Value) void {
        for (self.tasks.items) |t| {
            if (t.id == task_id and t.state == .Waiting) {
                _ = t.transitionTo(.Ready);
                t.resume_value = result;
                self.ready_queue.append(self.allocator, t) catch {};
                return;
            }
        }
    }

    pub fn cancelTask(self: *Scheduler, task_id: TaskId) void {
        for (self.tasks.items) |t| {
            if (t.id == task_id) {
                if (t.cancellation_token) |ct| ct.cancel();
                _ = t.transitionTo(.Cancelled);
                return;
            }
        }
    }

    /// Run the scheduler until all tasks reach terminal states (Completed, Failed, Cancelled)
    pub fn run(self: *Scheduler) !void {
        while (self.hasActiveTasks()) {
            // 1. Run all Ready tasks
            while (self.ready_queue.items.len > 0) {
                const task = self.ready_queue.orderedRemove(0);
                if (task.state != .Ready) continue;

                _ = task.transitionTo(.Running);
                self.current_task = task;
                self.vm.active_ctx = &task.context;

                // If resumed from an async native yield, clear arguments and push resume value
                if (task.context.yielded_argc) |argc| {
                    var i: usize = 0;
                    while (i < argc + 1) : (i += 1) {
                        const popped = self.vm.pop();
                        release(self.allocator, popped);
                    }
                    task.context.yielded_argc = null;
                    self.vm.push(task.resume_value);
                    task.resume_value = .Null;
                }

                // Execute the task until it returns or yields
                const res = self.vm.execute() catch |err| {
                    if (err == error.Yield) {
                        // Task yielded, transitioned to Waiting
                        _ = task.transitionTo(.Waiting);
                        continue;
                    }
                    _ = task.transitionTo(.Failed);
                    task.error_message = @errorName(err);
                    continue;
                };

                _ = task.transitionTo(.Completed);
                task.resume_value = res;
            }

            // 2. Check timers and wake up expired tasks
            var expired = std.ArrayList(TaskId).empty;
            defer expired.deinit(self.allocator);
            try self.timer_queue.pollExpired(&expired);
            for (expired.items) |tid| {
                self.wakeTask(tid, .Null);
            }

            // 3. If there are waiting tasks and no ready tasks, wait on event loop
            if (self.hasWaitingTasks() and self.ready_queue.items.len == 0) {
                const next_timeout = self.timer_queue.getNextTimeoutMs();
                var ready_events = std.ArrayList(IOEvent).empty;
                defer ready_events.deinit(self.allocator);
                try self.event_loop.poll(next_timeout, &ready_events);
                for (ready_events.items) |ev| {
                    self.wakeTask(ev.task_id, .Null);
                }
            }
        }
    }
};
