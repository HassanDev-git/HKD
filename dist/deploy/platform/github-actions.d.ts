/**
 * GitHub Actions Platform Adapter
 */
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
export declare class GithubActionsAdapter implements PlatformAdapter {
    readonly id = "github-actions";
    readonly name = "GitHub Actions CI/CD";
    readonly tier: "SUPPORTED";
    detect(projectDir: string): Promise<boolean>;
    validate(projectDir: string): Promise<PlatformValidation>;
    generateBundle(projectDir: string, _outDir: string): Promise<string[]>;
}
//# sourceMappingURL=github-actions.d.ts.map