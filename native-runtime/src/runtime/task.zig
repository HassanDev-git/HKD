const std = @import("std");
const vm_mod = @import("../vm.zig");
const Value = @import("../value.zig").Value;
const ExecutionContext = vm_mod.ExecutionContext;

pub const TaskId = u64;

pub const TaskState = enum {
    Ready,
    Running,
    Waiting,
    Completed,
    Failed,
    Cancelled,
};

pub const CancellationToken = struct {
    cancelled: bool = false,

    pub fn init() CancellationToken {
        return .{ .cancelled = false };
    }

    pub fn cancel(self: *CancellationToken) void {
        self.cancelled = true;
    }

    pub fn isCancelled(self: *const CancellationToken) bool {
        return self.cancelled;
    }
};

pub const Task = struct {
    id: TaskId,
    state: TaskState,
    context: ExecutionContext,
    cancellation_token: ?*CancellationToken = null,
    resume_value: Value = .Null,
    error_message: ?[]const u8 = null,
    next: ?*Task = null,

    pub fn init(id: TaskId) Task {
        return Task{
            .id = id,
            .state = .Ready,
            .context = ExecutionContext{},
            .cancellation_token = null,
            .resume_value = .Null,
            .error_message = null,
            .next = null,
        };
    }

    pub fn canTransitionTo(self: *const Task, new_state: TaskState) bool {
        return switch (self.state) {
            .Ready => new_state == .Running or new_state == .Cancelled,
            .Running => new_state == .Waiting or new_state == .Completed or new_state == .Failed or new_state == .Cancelled,
            .Waiting => new_state == .Ready or new_state == .Cancelled or new_state == .Failed,
            .Completed, .Failed, .Cancelled => false, // Terminal states cannot transition
        };
    }

    pub fn transitionTo(self: *Task, new_state: TaskState) bool {
        if (!self.canTransitionTo(new_state)) return false;
        self.state = new_state;
        return true;
    }
};
