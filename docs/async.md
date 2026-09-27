# HKD Asynchronous Execution Model Specification

This document defines the architecture, syntax, and task-scheduling model of the HKD Asynchronous Runtime.

---

## 1. Design Principles

HKD adopts a **cooperative, event-driven async model**:
- **Single-threaded Event Loop**: Avoids multithreaded synchronization hazards (data races, deadlocks) by driving tasks in a single-threaded runtime event loop.
- **Cooperative Multitasking**: Tasks yield execution implicitly when performing non-blocking I/O operations or explicitly using sleeps.
- **Smallest Language Fit**: We utilize the existing closure and function execution patterns to represent asynchronous work without introducing complex new language keywords like `async` or `await` initially.

---

## 2. Abstractions & Concepts

### Tasks
A **Task** represents an independent, suspendable flow of execution. Tasks are queued and executed on the runtime scheduler.

### Event Poller / Scheduler
- Keeps track of all pending Tasks.
- Registers file descriptors/handles with the platform's native I/O poller.
- Resumes suspended tasks when the I/O event fires or a timer expires.

---

## 3. Syntax & API Design (No Syntax Expansion First)

To keep language semantics stable, HKD represents async operations using:
- **Callback passing** or **Futures/Promises** represented as standard objects.
- Functions returning a Future object. A Future object has a `.then(callback)` function to register continuation.

Example:
```hkd
// Asynchronous HTTP GET return value
let future = http.get("http://localhost:3000/api")

future.then(fn(res) {
    print("Response: " + res.body)
})
```

### Scheduling & Execution Flow
1. A Task is spawned.
2. If the task performs a blocking network call, it registers a callback in the Event Poller and yields control.
3. The Scheduler executes other active tasks.
4. When the network response is received, the Poller schedules the callback to resume the task.

### Task Lifetime & Cancellation
- **Pending**: Awaiting registration/scheduling.
- **Running**: Active on the call stack.
- **Suspended**: Awaiting I/O event.
- **Completed**: Successfully exited.
- **Cancelled**: Aborted due to timeouts or explicit request.

### Error Handling
- Exceptions thrown within an asynchronous task are caught by the scheduler and propagated to the task's failure handler.

### Runtime Shutdown
- The runtime event loop runs as long as there are registered active timers, tasks, or monitored file descriptors. Once the poller is empty, the process exits cleanly with code 0.
