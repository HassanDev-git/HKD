import { describe, expect, test } from "@jest/globals";

const { resolvePackagingTarget } = require("../../scripts/package-platform.cjs");

describe("release package host target selection", () => {
  test.each([
    ["win32", "x64", "windows-x64", "hkd.exe"],
    ["win32", "arm64", "windows-arm64", "hkd.exe"],
    ["linux", "x64", "linux-x64", "hkd"],
    ["linux", "arm64", "linux-arm64", "hkd"],
    ["darwin", "x64", "macos-x64", "hkd"],
    ["darwin", "arm64", "macos-arm64", "hkd"],
  ])("maps %s/%s to %s", (platform, architecture, expected, executable) => {
    expect(resolvePackagingTarget(platform, architecture)).toMatchObject({
      platformName: expected,
      executableName: executable,
    });
  });

  test("rejects architectures without a release implementation", () => {
    expect(() => resolvePackagingTarget("win32", "ia32")).toThrow(/Unsupported packaging architecture/);
  });
});
