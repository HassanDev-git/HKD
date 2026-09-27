import { runDoctor } from "../../src/cli/doctor.js";

describe("HKD Tooling Doctor — Health & Integration Verification", () => {
  test("runs all subsystem diagnostic checks cleanly", () => {
    const report = runDoctor();

    expect(report).toBeDefined();
    expect(report.version).toBe("1.1.0");
    expect(report.checks.length).toBeGreaterThanOrEqual(5);

    const categories = report.checks.map((c) => c.category);
    expect(categories).toContain("compiler");
    expect(categories).toContain("lsp");
    expect(categories).toContain("debugger");
    expect(categories).toContain("package");

    // All checks must be either 'ok' or non-fatal 'warn'
    const errorChecks = report.checks.filter((c) => c.status === "error");
    expect(errorChecks.length).toBe(0);
    expect(report.allOk).toBe(true);
  });
});
