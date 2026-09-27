# HKD Debugger Protocol Integration Specification

This document details the design and architecture for mapping the HKD virtual machine execution state to the Microsoft Debug Adapter Protocol (DAP).

---

## 1. DAP Architecture

The HKD Debug Adapter operates as a middleman between the editor/debugger client and the running HKD VM:

```text
Editor (DAP Client) <---> HKD Debug Adapter <---> HKD VM (Debug Mode)
```

Communication is standard JSON-RPC over TCP/Sockets or Stdin/Stdout.

---

## 2. VM Debug Capabilities

To support standard debugger controls, the HKD VM (both reference TS VM and Zig Native VM) exposes the following state controls:

* **Breakpoints**: A set of instruction offsets mapping to file line numbers where execution pauses.
* **Step Over / Step Into / Step Out**: Virtual machine state stepping. Pauses execution when the current CallFrame's active instruction matches the target step conditions.
* **Stack Inspection**:
  * Call stack list of frame indices, names, and source lines.
  * Local scopes and variables lookup.
* **Variables Inspection**: Reading values on the VM stack using active frame offset mappings.
