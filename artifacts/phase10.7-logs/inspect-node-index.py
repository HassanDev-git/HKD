import json

with open("/home/redteam/.local/phase10.7-toolchain/downloads/node-index.json", encoding="utf-8") as stream:
    versions = json.load(stream)
for entry in versions:
    version = entry["version"]
    if version.startswith("v22."):
        print(version, "linux-x64-tar.xz" in entry["files"], entry["files"][:12])
