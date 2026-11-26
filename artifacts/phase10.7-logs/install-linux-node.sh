#!/usr/bin/env bash
set -Eeuo pipefail

tool_root=/home/redteam/.local/phase10.7-toolchain
mkdir -p "$tool_root/downloads" "$tool_root/lib"

curl --fail --silent --show-error --location https://nodejs.org/dist/index.json \
  --output "$tool_root/downloads/node-index.json"
node_version=$(python3 -c 'import json; d=json.load(open("/home/redteam/.local/phase10.7-toolchain/downloads/node-index.json")); print(next(x["version"] for x in d if x["version"].startswith("v22.") and "-" not in x["version"]))')
archive="node-$node_version-linux-x64.tar.xz"
base="https://nodejs.org/dist/$node_version"
curl --fail --silent --show-error --location "$base/$archive" --output "$tool_root/downloads/$archive"
curl --fail --silent --show-error --location "$base/SHASUMS256.txt" --output "$tool_root/downloads/SHASUMS256.txt"

expected_hash=$(awk -v file="$archive" '$2 == file { print $1 }' "$tool_root/downloads/SHASUMS256.txt")
test -n "$expected_hash"
printf '%s  %s\n' "$expected_hash" "$tool_root/downloads/$archive" | sha256sum --check --status

tar -xJf "$tool_root/downloads/$archive" -C "$tool_root/lib"
node_dir="$tool_root/lib/node-$node_version-linux-x64"
export PATH="$node_dir/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
printf 'NODE_VERSION=%s\n' "$("$node_dir/bin/node" --version)"
printf 'NPM_VERSION=%s\n' "$("$node_dir/bin/npm" --version)"
printf 'NODE_BINARY=%s\n' "$("$node_dir/bin/node" -p 'process.execPath')"
printf '%s\n' "$node_dir" > "$tool_root/node-dir.txt"
