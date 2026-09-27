/**
 * HKD Platform Adapter Abstraction & Registry
 */
export type PlatformSupportTier = "SUPPORTED" | "EXPERIMENTAL" | "NOT SUPPORTED";
export interface PlatformValidation {
    valid: boolean;
    warnings: string[];
    errors: string[];
}
export interface PlatformAdapter {
    readonly id: string;
    readonly name: string;
    readonly tier: PlatformSupportTier;
    detect(projectDir: string): Promise<boolean>;
    validate(projectDir: string): Promise<PlatformValidation>;
    generateBundle(projectDir: string, outDir: string): Promise<string[]>;
}
export declare class PlatformRegistry {
    private adapters;
    register(adapter: PlatformAdapter): void;
    get(id: string): PlatformAdapter | undefined;
    getAll(): PlatformAdapter[];
    detectActive(projectDir: string): Promise<PlatformAdapter[]>;
}
//# sourceMappingURL=platform-manager.d.ts.map