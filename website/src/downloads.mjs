export const RELEASE_ENDPOINT = "https://api.github.com/repos/HassanDev-git/HKD/releases/latest";

export const PLATFORM_ASSETS = Object.freeze([
  { platform: "Windows", architecture: "x64", id: "windows-x64" },
  { platform: "Windows", architecture: "ARM64", id: "windows-arm64" },
  { platform: "Linux", architecture: "x64", id: "linux-x64" },
  { platform: "Linux", architecture: "ARM64", id: "linux-arm64" },
  { platform: "macOS", architecture: "x64", id: "macos-x64" },
  { platform: "macOS", architecture: "ARM64", id: "macos-arm64" },
]);

const assetPattern = /^hkd-v(\d+\.\d+\.\d+)-(windows|linux|macos)-(x64|arm64)\.tar\.gz$/;

export function parseLatestRelease(release) {
  if (!release || typeof release !== "object" || release.draft === true || release.prerelease === true) {
    throw new TypeError("The latest stable HKD release is unavailable.");
  }
  if (typeof release.tag_name !== "string" || !/^v\d+\.\d+\.\d+$/.test(release.tag_name)) {
    throw new TypeError("The release response did not contain a stable semantic version tag.");
  }
  if (!Array.isArray(release.assets)) throw new TypeError("The release response did not include an asset list.");

  const version = release.tag_name.slice(1);
  const releasePrefix = `https://github.com/HassanDev-git/HKD/releases/download/${release.tag_name}/`;
  if (typeof release.html_url !== "string" || release.html_url !== `https://github.com/HassanDev-git/HKD/releases/tag/${release.tag_name}`) {
    throw new TypeError("The release response did not identify the official HKD release page.");
  }
  const assets = new Map();
  for (const asset of release.assets) {
    if (!asset || typeof asset.name !== "string") continue;
    const match = asset.name.match(assetPattern);
    if (!match || match[1] !== version) continue;
    const [, , platform, architecture] = match;
    if (asset.browser_download_url !== `${releasePrefix}${asset.name}`) continue;
    const size = Number(asset.size);
    if (!Number.isSafeInteger(size) || size < 0) continue;
    assets.set(`${platform}-${architecture}`, {
      name: asset.name,
      url: asset.browser_download_url,
      sizeBytes: size,
      platform,
      architecture,
    });
  }

  const metadata = new Map((release.assets || []).filter((asset) => asset && typeof asset.name === "string")
    .map((asset) => [asset.name, asset]));
  const sha256Sums = metadata.get("SHA256SUMS");
  const manifest = metadata.get("release-manifest.json");
  const validMetadataUrl = (asset) => asset && asset.browser_download_url === `${releasePrefix}${asset.name}`;

  return {
    version,
    url: release.html_url,
    publishedAt: release.published_at,
    assets,
    checksumsUrl: validMetadataUrl(sha256Sums) ? sha256Sums.browser_download_url : null,
    manifestUrl: validMetadataUrl(manifest) ? manifest.browser_download_url : null,
  };
}

export function recommendAsset(assets, platform, architecture) {
  if (!platform || !architecture) return null;
  const platformId = ({ windows: "windows", win32: "windows", linux: "linux", macos: "macos", darwin: "macos" })[platform.toLowerCase()];
  const architectureId = ({ x64: "x64", x86_64: "x64", amd64: "x64", arm64: "arm64", aarch64: "arm64", arm: "arm64" })[architecture.toLowerCase()];
  if (!platformId || !architectureId) return null;
  return assets.get(`${platformId}-${architectureId}`) || null;
}

export async function fetchLatestRelease(fetcher = fetch) {
  const response = await fetcher(RELEASE_ENDPOINT, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "default",
  });
  if (!response.ok) {
    const reason = response.status === 403 || response.status === 429
      ? "GitHub's release API rate limit was reached."
      : `GitHub returned HTTP ${response.status}.`;
    throw new Error(reason);
  }
  return parseLatestRelease(await response.json());
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "Size unavailable";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value;
  let unit = -1;
  do { size /= 1024; unit++; } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(1)} ${units[unit]}`;
}
