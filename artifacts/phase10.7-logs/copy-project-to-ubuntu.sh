#!/usr/bin/env bash
set -Eeuo pipefail

source_dir=/mnt/c/Users/HASSAN/OneDrive/Desktop/HKD
destination=/home/redteam/HKD-phase10.7-linux

if [[ -e "$destination" ]]; then
  printf 'Destination already exists; refusing to overwrite: %s\n' "$destination" >&2
  exit 17
fi

mkdir -m 700 "$destination"
tar -cpf - --exclude=node_modules -C "$source_dir" . | tar -xpf - -C "$destination"
printf 'Copy size: '
du -sh "$destination"
printf 'Git status entries: '
git -C "$destination" status --short | wc -l
printf 'HEAD: '
git -C "$destination" rev-parse HEAD
