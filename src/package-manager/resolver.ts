/**
 * HKD Dependency Resolver 2.0
 *
 * Implements deterministic transitive dependency resolution using a multi-pass
 * constraint-satisfaction algorithm with cycle detection, conflict reporting,
 * and lockfile replay.
 */

import { HkdManifest } from "./index.js";
import { normalizePackageName } from "./identity.js";
import { satisfies, selectHighestCompatible } from "./semver.js";
import { LockfileV2, LockedPackage } from "./lockfile.js";

export interface PackageMetadataProvider {
  getAvailableVersions(pkgName: string): string[];
  getPackageManifest(pkgName: string, version: string): HkdManifest | null;
  getPackageIntegrity(pkgName: string, version: string): string;
}

export interface ResolutionOptions {
  existingLockfile?: LockfileV2 | null;
  provider: PackageMetadataProvider;
  offline?: boolean;
}

export interface ResolvedPackageNode {
  name: string;
  version: string;
  source: string;
  checksum: string;
  dependencies: Record<string, string>; // child_name -> exact_resolved_version
}

export interface ResolutionResult {
  packages: Record<string, ResolvedPackageNode>;
  lockfile: LockfileV2;
}

interface VersionConstraint {
  dependent: string;
  range: string;
}

/**
 * Resolves all direct and transitive dependencies deterministically.
 */
export function resolveDependencyGraph(
  rootManifest: HkdManifest,
  options: ResolutionOptions
): ResolutionResult {
  const { provider, existingLockfile } = options;

  const directDeps: Record<string, string | { path: string }> = {
    ...rootManifest.dependencies,
    ...rootManifest.devDependencies,
  };

  const constraints: Map<string, VersionConstraint[]> = new Map();
  const pathSources: Map<string, string> = new Map();
  const resolvedVersions: Map<string, string> = new Map();
  const resolvedManifests: Map<string, HkdManifest> = new Map();

  // 1. Register root direct constraints
  const sortedDirectNames = Object.keys(directDeps).sort((a, b) => a.localeCompare(b));
  for (const rawName of sortedDirectNames) {
    const name = normalizePackageName(rawName);
    const depVal = directDeps[rawName];

    if (typeof depVal === "object" && depVal !== null && "path" in depVal) {
      pathSources.set(name, depVal.path);
      addConstraint(constraints, name, "root", "*");
    } else {
      const range = typeof depVal === "string" ? depVal : "*";
      addConstraint(constraints, name, "root", range);
    }
  }

  // 2. Worklist queue of packages needing resolution
  const queue: Set<string> = new Set(sortedDirectNames.map((n) => normalizePackageName(n)));
  let iterations = 0;
  const maxIterations = 1000;

  while (queue.size > 0) {
    iterations++;
    if (iterations > maxIterations) {
      throw new Error(`error[PKG001]: Dependency resolution exceeded iteration limit (possible unresolvable constraint loop)`);
    }

    // Always pick alphabetically first package in the queue for deterministic execution
    const sortedQueue = Array.from(queue).sort((a, b) => a.localeCompare(b));
    const pkgName = sortedQueue[0];
    queue.delete(pkgName);

    const pkgConstraints = constraints.get(pkgName) || [];
    const isPathDep = pathSources.has(pkgName);

    let chosenVersion = "";
    let subManifest: HkdManifest | null = null;

    if (isPathDep) {
      subManifest = provider.getPackageManifest(pkgName, "local");
      if (!subManifest) {
        throw new Error(`error[PKG003]: Path dependency manifest not found for '${pkgName}'`);
      }
      chosenVersion = subManifest.version;
    } else {
      // Check existing lockfile first
      let candidateFromLock: LockedPackage | null = null;
      if (existingLockfile) {
        candidateFromLock = existingLockfile.packages.find((p) => p.name === pkgName) || null;
      }

      if (
        candidateFromLock &&
        pkgConstraints.every((c) => satisfies(candidateFromLock!.version, c.range))
      ) {
        chosenVersion = candidateFromLock.version;
        subManifest = provider.getPackageManifest(pkgName, chosenVersion);
      } else {
        const available = provider.getAvailableVersions(pkgName);
        if (available.length === 0) {
          throw new Error(`error[PKG004]: No versions available for package '${pkgName}'`);
        }

        const validVersions = available.filter((ver) =>
          pkgConstraints.every((c) => satisfies(ver, c.range))
        );

        if (validVersions.length === 0) {
          const constraintDetails = pkgConstraints
            .map((c) => `  ${c.dependent} requires ${c.range}`)
            .join("\n");
          throw new Error(
            `error[PKG001]: Dependency conflict for package '${pkgName}':\n${constraintDetails}\n  (Available: ${available.join(", ")})`
          );
        }

        const best = selectHighestCompatible(validVersions, "*");
        if (!best) {
          throw new Error(`error[PKG001]: Failed to select compatible version for '${pkgName}'`);
        }
        chosenVersion = best;
        subManifest = provider.getPackageManifest(pkgName, chosenVersion);
      }
    }

    if (!subManifest) {
      throw new Error(`error[PKG005]: Package manifest missing for '${pkgName}@${chosenVersion}'`);
    }

    const prevVersion = resolvedVersions.get(pkgName);
    resolvedVersions.set(pkgName, chosenVersion);
    resolvedManifests.set(pkgName, subManifest);

    // If version changed, update child constraints
    const subDeps = subManifest.dependencies || {};
    const sortedSubKeys = Object.keys(subDeps).sort((a, b) => a.localeCompare(b));

    for (const rawChild of sortedSubKeys) {
      const childName = normalizePackageName(rawChild);
      const childRange = typeof subDeps[rawChild] === "string" ? (subDeps[rawChild] as string) : "*";

      const existingCList = constraints.get(childName) || [];
      const dependentId = `${pkgName}@${chosenVersion}`;

      // Remove any prior constraint from this package's previous version
      const filtered = existingCList.filter((c) => !c.dependent.startsWith(`${pkgName}@`));
      filtered.push({ dependent: dependentId, range: childRange });
      constraints.set(childName, filtered);

      // Check if child needs resolution or re-resolution
      const currentChildVer = resolvedVersions.get(childName);
      if (!currentChildVer || !satisfies(currentChildVer, childRange)) {
        queue.add(childName);
      }
    }
  }

  // 3. Cycle Detection on the resolved dependency graph
  const adjList: Map<string, string[]> = new Map();
  for (const [name, manifest] of resolvedManifests.entries()) {
    const subDeps = manifest.dependencies || {};
    adjList.set(
      name,
      Object.keys(subDeps).map((k) => normalizePackageName(k)).sort((a, b) => a.localeCompare(b))
    );
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function checkCycle(node: string, pathStack: string[]) {
    visited.add(node);
    recStack.add(node);

    const neighbors = adjList.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        checkCycle(neighbor, [...pathStack, neighbor]);
      } else if (recStack.has(neighbor)) {
        const cycleStr = [...pathStack, neighbor].join(" -> ");
        throw new Error(`error[PKG002]: Circular dependency cycle detected:\n  ${cycleStr}`);
      }
    }

    recStack.delete(node);
  }

  for (const node of adjList.keys()) {
    if (!visited.has(node)) {
      checkCycle(node, [node]);
    }
  }

  // 4. Build output nodes and LockfileV2
  const resolvedNodes: Record<string, ResolvedPackageNode> = {};
  const lockedPackages: LockedPackage[] = [];

  const sortedResolvedNames = Array.from(resolvedVersions.keys()).sort((a, b) => a.localeCompare(b));

  for (const name of sortedResolvedNames) {
    const version = resolvedVersions.get(name)!;
    const manifest = resolvedManifests.get(name)!;
    const isPath = pathSources.has(name);
    const source = isPath ? `path:${pathSources.get(name)}` : "registry";
    const checksum = provider.getPackageIntegrity(name, version);

    const childMap: Record<string, string> = {};
    const depsArray: string[] = [];

    const subDeps = manifest.dependencies || {};
    const sortedSubKeys = Object.keys(subDeps).sort((a, b) => a.localeCompare(b));

    for (const rawChild of sortedSubKeys) {
      const childName = normalizePackageName(rawChild);
      const childVer = resolvedVersions.get(childName);
      if (childVer) {
        childMap[childName] = childVer;
        depsArray.push(`${childName} ${childVer}`);
      }
    }

    resolvedNodes[name] = {
      name,
      version,
      source,
      checksum,
      dependencies: childMap,
    };

    lockedPackages.push({
      name,
      version,
      source,
      checksum,
      dependencies: depsArray,
    });
  }

  return {
    packages: resolvedNodes,
    lockfile: {
      version: 2,
      resolver: "2.0",
      packages: lockedPackages,
    },
  };
}

function addConstraint(
  constraintsMap: Map<string, VersionConstraint[]>,
  pkgName: string,
  dependent: string,
  range: string
) {
  if (!constraintsMap.has(pkgName)) {
    constraintsMap.set(pkgName, []);
  }
  constraintsMap.get(pkgName)!.push({ dependent, range });
}
