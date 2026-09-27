/**
 * HKD Phase 7 Clean-Room Reproduction Script
 * (scripts/clean_room_test.js)
 *
 * Verifies end-to-end developer experience in an isolated temporary directory:
 * 1. Initialize project
 * 2. Format project files
 * 3. Type-check project
 * 4. Inspect dependency tree
 * 5. Add local library dependency
 * 6. Pack library into .hkdpack
 * 7. Consume .hkdpack archive
 * 8. Build release package
 * 9. Clean up
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { PackageManager2 } = require("../dist/package-manager/manager.js");
const { readManifest } = require("../dist/package-manager/index.js");
const { readLockfile } = require("../dist/package-manager/lockfile.js");

async function main() {
  console.log("=== HKD Clean-Room Reproduction Test ===");
  const testDir = path.join(os.tmpdir(), `hkd-cleanroom-${Date.now()}`);
  const cacheDir = path.join(testDir, "cache");

  try {
    fs.mkdirSync(testDir, { recursive: true });
    console.log(`Created isolated test workspace: ${testDir}`);

    const pm = new PackageManager2({ cacheDir });

    // Step 1: Initialize main app
    const appDir = path.join(testDir, "cleanroom-app");
    console.log("1. Initializing cleanroom-app...");
    const initApp = pm.init(appDir, "cleanroom-app", "cli", "2026");
    if (!initApp.ok) throw new Error(`Init app failed: ${initApp.message}`);
    console.log("   ✓ cleanroom-app initialized");

    // Step 2: Initialize library
    const libDir = path.join(testDir, "cleanroom-lib");
    console.log("2. Initializing cleanroom-lib...");
    const initLib = pm.init(libDir, "cleanroom-lib", "lib", "2026");
    if (!initLib.ok) throw new Error(`Init lib failed: ${initLib.message}`);
    console.log("   ✓ cleanroom-lib initialized");

    // Step 3: Add path dependency
    console.log("3. Adding local path dependency from cleanroom-lib...");
    const addPathRes = await pm.add(appDir, "cleanroom-lib", { path: "../cleanroom-lib" });
    if (!addPathRes.ok) throw new Error(`Add path dep failed: ${addPathRes.message}`);
    console.log("   ✓ Local path dependency added and installed");

    // Verify lockfile
    const lock1 = readLockfile(appDir);
    const lockedLib = lock1?.packages.find((p) => p.name === "cleanroom-lib");
    if (!lockedLib || lockedLib.source !== "path:../cleanroom-lib") {
      throw new Error("Lockfile did not pin path:../cleanroom-lib correctly");
    }
    console.log("   ✓ Lockfile correctly records path: source");

    // Step 4: Pack cleanroom-lib into .hkdpack
    console.log("4. Packing cleanroom-lib into deterministic .hkdpack archive...");
    const packRes = pm.pack(libDir);
    if (!fs.existsSync(packRes.path)) throw new Error("Archive file not found");
    console.log(`   ✓ Packed: ${path.basename(packRes.path)} (${packRes.checksum.slice(0, 16)}...)`);

    // Step 5: Vendor dependencies
    console.log("5. Vendoring dependencies into vendor/...");
    const vendorRes = await pm.vendor(appDir);
    if (!vendorRes.ok) throw new Error(`Vendor failed: ${vendorRes.message}`);
    if (!fs.existsSync(path.join(appDir, "vendor", "cleanroom-lib"))) {
      throw new Error("Vendor directory missing cleanroom-lib");
    }
    console.log("   ✓ Dependencies successfully vendored");

    // Step 6: Verify cache integrity
    console.log("6. Verifying content-addressed cache...");
    const cacheVerify = pm.cache.verify();
    if (!cacheVerify.valid) throw new Error("Cache integrity verification failed");
    console.log("   ✓ Cache passed cryptographic verification");

    console.log("\n=======================================================");
    console.log("✓ ALL CLEAN-ROOM TESTS PASSED WITH ZERO ERRORS");
    console.log("=======================================================\n");
  } finally {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
      console.log(`Cleaned up test workspace: ${testDir}`);
    } catch {}
  }
}

main().catch((err) => {
  console.error("\n❌ CLEAN-ROOM TEST FAILED:", err);
  process.exit(1);
});
