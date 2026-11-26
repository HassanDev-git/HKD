from pathlib import Path

path = Path("/home/redteam/HKD-phase10.7-linux/native-runtime/src/jit/x86_64.zig")
source = path.read_text(encoding="utf-8")
old = "std.posix.mmap(null, rounded_capacity, PROT_READ | PROT_WRITE,"
new = "std.posix.mmap(null, rounded_capacity, .{ .READ = true, .WRITE = true },"
if source.count(old) != 1:
    raise SystemExit(f"Expected one mmap protection expression in Linux copy; found {source.count(old)}")
path.write_text(source.replace(old, new), encoding="utf-8")
print(f"Applied Zig 0.16 PROT struct change only in {path}")
