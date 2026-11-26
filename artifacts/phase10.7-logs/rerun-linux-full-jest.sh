#!/usr/bin/env bash
set -u
repo=/home/redteam/HKD-phase10.7-linux
tool_root=/home/redteam/.local/phase10.7-toolchain
node_dir=$(cat "$tool_root/node-dir.txt")
export PATH="$node_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd "$repo"
log="$repo/artifacts/phase10.7-linux-logs/jest_full_after_native_build.log"
"$node_dir/bin/npm" test > "$log" 2>&1
status=$?
printf '%s\n' "$status" > "$repo/artifacts/phase10.7-linux-logs/jest_full_after_native_build.exit"
grep -E '^(FAIL|PASS|Test Suites:|Tests:|Snapshots:|Time:|Ran all test suites)' "$log" | tail -35
printf 'FULL_JEST_EXIT=%s\n' "$status"
