#!/usr/bin/env bash
set -uo pipefail

repo=/home/redteam/HKD-phase10.7-linux
tool_root=/home/redteam/.local/phase10.7-toolchain
node_dir=$(cat "$tool_root/node-dir.txt")
export PATH="$node_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
cd "$repo"

log_dir="$repo/artifacts/phase10.7-linux-logs"
if [[ -e "$log_dir" ]]; then
  printf 'Refusing to overwrite existing Linux evidence directory: %s\n' "$log_dir" >&2
  exit 17
fi
mkdir -p "$log_dir/programs"
: > "$log_dir/commands.tsv"

run_check() {
  local name=$1
  shift
  local logfile="$log_dir/$name.log"
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
  } > "$logfile"
  if "$@" >> "$logfile" 2>&1; then
    local code=0
  else
    local code=$?
  fi
  printf '\nEXIT_CODE=%s\n' "$code" >> "$logfile"
  printf '%s\t%s\t%s\n' "$name" "$code" "$*" >> "$log_dir/commands.tsv"
  printf '\n=== %s (exit %s) ===\n' "$name" "$code"
  cat "$logfile"
}

run_expected() {
  local name=$1 expected=$2 output_pattern=$3
  shift 3
  local logfile="$log_dir/$name.log"
  {
    printf '$'
    printf ' %q' "$@"
    printf '\nEXPECTED_EXIT_CODE=%s\n\n' "$expected"
  } > "$logfile"
  if "$@" >> "$logfile" 2>&1; then
    local actual=0
  else
    local actual=$?
  fi
  local check=PASS
  if [[ "$actual" -ne "$expected" ]]; then check=FAIL; fi
  if [[ -n "$output_pattern" ]] && ! grep -Eiq "$output_pattern" "$logfile"; then check=FAIL; fi
  printf '\nACTUAL_EXIT_CODE=%s\nCHECK=%s\n' "$actual" "$check" >> "$logfile"
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$actual" "$expected" "$check" "$*" >> "$log_dir/commands.tsv"
  printf '\n=== %s (actual %s, expected %s, %s) ===\n' "$name" "$actual" "$expected" "$check"
  cat "$logfile"
}

run_check environment "$node_dir/bin/node" -e 'console.log(JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,execPath:process.execPath}))'
run_check npm_ci "$node_dir/bin/npm" ci
run_check typecheck "$node_dir/bin/npm" run typecheck
run_check build "$node_dir/bin/npm" run build
run_check jest_full "$node_dir/bin/npm" test
run_check eslint "$node_dir/bin/npm" run lint
run_check zig_ci env ZIG_PACKAGE=linux-x64 HKD_NATIVE_OUTPUT_DIR=native-runtime/zig-out/bin "$node_dir/bin/node" scripts/ci-zig.cjs

run_expected cli_version 0 'HKD 1\.1\.0' "$node_dir/bin/node" dist/cli/main.js --version
run_expected cli_help 0 'USAGE:' "$node_dir/bin/node" dist/cli/main.js --help
run_expected native_runtime_version 0 'HKD 1\.1\.0' native-runtime/zig-out/bin/hkd-runtime --version

printf 'print("HKD Linux valid program passed");\n' > "$log_dir/programs/valid.hkd"
printf 'let = ;\n' > "$log_dir/programs/invalid.hkd"
run_expected valid_program 0 'HKD Linux valid program passed' "$node_dir/bin/node" dist/cli/main.js run "$log_dir/programs/valid.hkd"
run_expected invalid_program 1 'HKD Error|error|expected|unexpected' "$node_dir/bin/node" dist/cli/main.js run "$log_dir/programs/invalid.hkd"

run_check package_security_and_benchmark_regressions "$node_dir/bin/npm" test -- --runTestsByPath tests/security/phase10_6_boundaries.test.ts tests/security/package_fuzzing.test.ts tests/performance/phase9_baseline.test.ts --runInBand

python3 - "$log_dir/commands.tsv" "$log_dir/exit-codes.json" <<'PY'
import json, sys
rows = []
with open(sys.argv[1], encoding="utf-8") as stream:
    for line in stream:
        fields = line.rstrip("\n").split("\t", 4)
        row = {"name": fields[0], "actualExitCode": int(fields[1])}
        if len(fields) == 5:
            row.update({"expectedExitCode": int(fields[2]), "assertion": fields[3], "command": fields[4]})
        else:
            row["command"] = fields[2]
        row["log"] = "artifacts/phase10.7-linux-logs/" + row["name"] + ".log"
        rows.append(row)
with open(sys.argv[2], "w", encoding="utf-8") as stream:
    json.dump(rows, stream, indent=2)
    stream.write("\n")
PY

printf '\nLinux x64 checks complete; see %s\n' "$log_dir"
