/**
 * HKD Software Bill of Materials (SBOM) Generator
 *
 * Implements CycloneDX 1.5 JSON specification for supply-chain security,
 * listing application identity, dependencies, versions, and cryptographic hashes.
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { readManifest } from "../package-manager/index.js";
import { LockfileV2, parseLockfileV2, LockedPackage } from "../package-manager/lockfile.js";
import { HKD_VERSION } from "../utils/index.js";

export interface SbomComponent {
  type: "application" | "library" | "framework";
  name: string;
  version: string;
  description?: string;
  hashes?: Array<{ alg: string; content: string }>;
  licenses?: Array<{ license: { id: string } }>;
  purl?: string;
}

export interface CycloneDxSbom {
  bomFormat: "CycloneDX";
  specVersion: "1.5";
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools: Array<{ vendor: string; name: string; version: string }>;
    component: SbomComponent;
  };
  components: SbomComponent[];
}

export function generateCycloneDxSbom(projectDir: string): CycloneDxSbom {
  const manifest = readManifest(projectDir);
  const appName = manifest?.name || path.basename(projectDir);
  const appVersion = manifest?.version || "0.1.0";

  const components: SbomComponent[] = [];

  // Add compiler & runtime components
  components.push({
    type: "framework",
    name: "hkd-compiler",
    version: HKD_VERSION,
    description: "HKD Programming Language Compiler & Toolchain",
    purl: `pkg:generic/hkd-compiler@${HKD_VERSION}`,
  });

  components.push({
    type: "framework",
    name: "hkd-runtime",
    version: HKD_VERSION,
    description: "HKD High-Performance Native Zig & Stack VM Runtime",
    purl: `pkg:generic/hkd-runtime@${HKD_VERSION}`,
  });

  // Read lockfile if present
  const lockPath = path.join(projectDir, "hkd.lock");
  if (fs.existsSync(lockPath)) {
    try {
      const lockContent = fs.readFileSync(lockPath, "utf-8");
      const lockData = parseLockfileV2(lockContent);
      for (const pkgEntry of lockData.packages) {
        const hashes: Array<{ alg: string; content: string }> = [];
        if (pkgEntry.checksum) {
          const cleanHash = pkgEntry.checksum.replace(/^sha256:/, "");
          hashes.push({ alg: "SHA-256", content: cleanHash });
        }
        components.push({
          type: "library",
          name: pkgEntry.name,
          version: pkgEntry.version,
          description: `Resolved HKD dependency: ${pkgEntry.name}`,
          hashes,
          purl: `pkg:hkd/${pkgEntry.name}@${pkgEntry.version}`,
        });
      }
    } catch {}
  }

  const serialUuid = crypto.randomUUID();

  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${serialUuid}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [
        {
          vendor: "HKD Language",
          name: "hkd-sbom",
          version: HKD_VERSION,
        },
      ],
      component: {
        type: "application",
        name: appName,
        version: appVersion,
        description: manifest?.description || "HKD Application",
        purl: `pkg:hkd/${appName}@${appVersion}`,
      },
    },
    components,
  };
}

export function writeSbomJson(projectDir: string, outPath?: string): string {
  const sbom = generateCycloneDxSbom(projectDir);
  const dest = outPath || path.join(projectDir, "target", "sbom.json");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(sbom, null, 2), "utf-8");
  return dest;
}
