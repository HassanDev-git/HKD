/**
 * Application 4: HKD Project Inspector Verification Test
 * (tests/examples/project_inspector.test.ts)
 */

import * as path from "path";
import { runFile } from "../../src/runtime/index.js";

describe("Workstream 8M: Application 4 — Realistic Developer Tool", () => {
  test("project_inspector scans workspace, reads manifest, calculates LOC, and reports health", () => {
    const inspectorPath = path.resolve(__dirname, "../../examples/dogfood/project_inspector/main.hkd");
    let out = "";
    const res = runFile(inspectorPath, {
      noExit: true,
      output: (s) => {
        out += s + "\n";
      },
    });

    expect(res.ok).toBe(true);
    expect(out).toContain("Starting HKD Project Inspector...");
    expect(out).toContain("HKD PROJECT INSPECTION REPORT");
    expect(out).toContain("Package Name:");
    expect(out).toContain("Package Version:");
    expect(out).toContain("Target Edition:");
    expect(out).toContain("Source Modules:");
    expect(out).toContain("Total Lines:");
    expect(out).toContain("Lockfile Present: true");
    expect(out).toContain("Health Status:    HEALTHY");
    expect(out).toContain("Project inspection finished successfully.");
  });
});
