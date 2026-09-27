/**
 * HKD 1.0 Project Migration Engine
 *
 * Upgrades pre-1.0 project manifests and lockfiles to Edition 2026 standards,
 * backing up existing files and verifying consistency.
 */
export interface MigrationResult {
    ok: boolean;
    changes: string[];
    warnings: string[];
}
export declare function runMigration(projectDir: string, dryRun?: boolean, targetEdition?: "2026" | "2027"): MigrationResult;
//# sourceMappingURL=migrate.d.ts.map