import test from "node:test";
import assert from "node:assert/strict";
import { fetchLatestRelease, formatBytes, parseLatestRelease, recommendAsset, RELEASE_ENDPOINT } from "./downloads.mjs";

function fixture(overrides = {}) {
  return {
    tag_name: "v1.1.1",
    html_url: "https://github.com/HassanDev-git/HKD/releases/tag/v1.1.1",
    published_at: "2026-11-27T09:17:45Z",
    draft: false,
    prerelease: false,
    assets: ["windows-x64", "windows-arm64", "linux-x64", "linux-arm64", "macos-x64", "macos-arm64"].map((id) => {
      const [platform, architecture] = id.split("-");
      const name = `hkd-v1.1.1-${platform}-${architecture}.tar.gz`;
      return { name, size: 2048, browser_download_url: `https://github.com/HassanDev-git/HKD/releases/download/v1.1.1/${name}` };
    }).concat([
      { name: "SHA256SUMS", size: 500, browser_download_url: "https://github.com/HassanDev-git/HKD/releases/download/v1.1.1/SHA256SUMS" },
      { name: "release-manifest.json", size: 1000, browser_download_url: "https://github.com/HassanDev-git/HKD/releases/download/v1.1.1/release-manifest.json" },
      { name: "hkd-v9.9.9-linux-x64.tar.gz", size: 1, browser_download_url: "https://github.com/HassanDev-git/HKD/releases/download/v1.1.1/wrong-version.tar.gz" },
    ]),
    ...overrides,
  };
}

test("parses only matching real release assets and metadata links", () => {
  const release = parseLatestRelease(fixture());
  assert.equal(release.version, "1.1.1");
  assert.equal(release.assets.size, 6);
  assert.equal(release.manifestUrl.endsWith("release-manifest.json"), true);
  assert.equal(release.checksumsUrl.endsWith("SHA256SUMS"), true);
  assert.equal(release.assets.has("windows-x64"), true);
});

test("omits missing packages and rejects lookalike or non-GitHub URLs", () => {
  const data = fixture({ assets: [
    { name: "hkd-v1.1.1-linux-x64.tar.gz", size: 10, browser_download_url: "https://example.com/file.tar.gz" },
    { name: "hkd-v1.1.1-linux-arm64.tar.gz", size: "not-a-size", browser_download_url: "https://github.com/HassanDev-git/HKD/releases/download/v1.1.1/file.tar.gz" },
  ] });
  const release = parseLatestRelease(data);
  assert.equal(release.assets.size, 0);
});

test("fails closed for malformed or prerelease API payloads", () => {
  assert.throws(() => parseLatestRelease(null), /unavailable/);
  assert.throws(() => parseLatestRelease(fixture({ tag_name: "main" })), /semantic version/);
  assert.throws(() => parseLatestRelease(fixture({ prerelease: true })), /unavailable/);
  assert.throws(() => parseLatestRelease(fixture({ assets: null })), /asset list/);
});

test("recommends only known platform and architecture combinations", () => {
  const assets = parseLatestRelease(fixture()).assets;
  assert.equal(recommendAsset(assets, "win32", "x64").name, "hkd-v1.1.1-windows-x64.tar.gz");
  assert.equal(recommendAsset(assets, "macOS", "arm64").name, "hkd-v1.1.1-macos-arm64.tar.gz");
  assert.equal(recommendAsset(assets, "linux", "riscv64"), null);
  assert.equal(recommendAsset(assets, "unknown", "x64"), null);
});

test("formats file sizes without inventing missing values", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(Number.NaN), "Size unavailable");
});

test("fetches the official latest endpoint and surfaces network and API failures", async () => {
  let requested;
  const release = await fetchLatestRelease(async (url, options) => {
    requested = { url, options };
    return { ok: true, json: async () => fixture() };
  });
  assert.equal(requested.url, RELEASE_ENDPOINT);
  assert.equal(requested.options.cache, "default");
  assert.equal(release.version, "1.1.1");
  await assert.rejects(fetchLatestRelease(async () => ({ ok: false, status: 429 })), /rate limit/);
  await assert.rejects(fetchLatestRelease(async () => { throw new TypeError("offline"); }), /offline/);
});
