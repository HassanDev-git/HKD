/**
 * HKD 1.1 Real-World Applications Test Suite
 * (tests/examples/real_world_1_1.test.ts)
 *
 * Verifies that HKD 1.1 production examples execute cleanly, produce expected
 * results, and demonstrate generics, pattern matching, stdlib 1.1 iterators, and Result.
 */

import * as path from "path";
import { runFile } from "../../src/runtime/index.js";

describe("HKD 1.1 Real-World Applications", () => {
  test("RW-01: Web API service processes routing, generics, and Result", () => {
    const webApiPath = path.resolve(__dirname, "../../examples/real-world/web-api/src/main.hkd");
    let out = "";
    const res = runFile(webApiPath, {
      noExit: true,
      output: s => { out += s + "\n"; },
    });

    expect(res.ok).toBe(true);
    expect(out).toContain("GET /health -> [200 OK] Service Healthy");
    expect(out).toContain("GET /version -> [200 OK] HKD 1.1.0 (Edition 2027)");
    expect(out).toContain("POST /users -> [201 Created] User Created Successfully");
    expect(out).toContain("GET /missing -> [404 Not Found] Endpoint Not Found");
    expect(out).toContain("ERROR: Method Not Allowed: PATCH");
  });

  test("RW-02: Data processing pipeline folds, searches, and audits records", () => {
    const dataProcPath = path.resolve(__dirname, "../../examples/real-world/data-processing/src/main.hkd");
    let out = "";
    const res = runFile(dataProcPath, {
      noExit: true,
      output: s => { out += s + "\n"; },
    });

    expect(res.ok).toBe(true);
    expect(out).toContain("Dataset ingested: 5 records");
    expect(out).toContain("All records valid: true");
    expect(out).toContain("Any anomalies detected: false");
    expect(out).toContain("First high-value transaction: ID 2 (cloud) = $1200");
    expect(out).toContain("Total pipeline revenue: $4530");
    expect(out).toContain("Audit status: Approved [Tier 1 Enterprise]");
  });
});
