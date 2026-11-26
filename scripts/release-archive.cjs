const fs = require("node:fs");
const zlib = require("node:zlib");

function readPackageManifest(archivePath) {
  const tar = zlib.gunzipSync(fs.readFileSync(archivePath));
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const entryName = prefix ? `${prefix}/${name}` : name;
    const rawSize = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = Number.parseInt(rawSize || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid TAR entry size for ${entryName}`);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) throw new Error(`Truncated TAR entry: ${entryName}`);
    if (entryName === "./manifest.json" || entryName === "manifest.json") {
      return JSON.parse(tar.subarray(dataStart, dataEnd).toString("utf8"));
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`Package archive does not contain manifest.json: ${archivePath}`);
}

module.exports = { readPackageManifest };
