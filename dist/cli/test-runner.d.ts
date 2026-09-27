/**
 * HKD Test Runner
 *
 * Discovers and runs test blocks in HKD files.
 *
 * Usage:
 *   hkd test           - runs all *.test.hkd files
 *   hkd test file.hkd  - runs tests in a specific file
 */
export interface TestOptions {
    filter?: string;
    verbose?: boolean;
    quiet?: boolean;
    conformance?: boolean;
    differential?: boolean;
}
export declare function runTests(target: string, opts?: TestOptions): void;
//# sourceMappingURL=test-runner.d.ts.map