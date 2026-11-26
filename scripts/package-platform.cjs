const SUPPORTED_PLATFORMS = {
  win32: "windows",
  linux: "linux",
  darwin: "macos",
};

function resolvePackagingTarget(platform, architecture) {
  const platformLabel = SUPPORTED_PLATFORMS[platform];
  if (!platformLabel) throw new Error(`Unsupported packaging platform: ${platform}`);
  if (architecture !== "x64" && architecture !== "arm64") {
    throw new Error(`Unsupported packaging architecture: ${architecture}`);
  }

  const platformName = `${platformLabel}-${architecture}`;
  return {
    platformLabel,
    architecture,
    platformName,
    executableName: platform === "win32" ? "hkd.exe" : "hkd",
  };
}

module.exports = { resolvePackagingTarget };
