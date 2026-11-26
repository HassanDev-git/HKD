#!/usr/bin/env bash
set -Eeuo pipefail

source_dir=/home/redteam/HKD-phase10.7-linux/artifacts/phase10.7-linux-logs
destination=/mnt/c/Users/HASSAN/OneDrive/Desktop/HKD/artifacts/phase10.7-logs/ubuntu

if [[ -e "$destination" ]]; then
  printf 'Refusing to overwrite existing Windows evidence directory: %s\n' "$destination" >&2
  exit 17
fi
mkdir -m 755 "$destination"
cp -a "$source_dir/." "$destination/"
printf 'Linux evidence copied: %s\n' "$destination"
printf 'Files: '
find "$destination" -type f | wc -l
du -sh "$destination"
