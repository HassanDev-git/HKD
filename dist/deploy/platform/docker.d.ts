/**
 * Docker Platform Adapter
 */
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
export declare class DockerAdapter implements PlatformAdapter {
    readonly id = "docker";
    readonly name = "Docker / OCI Container";
    readonly tier: "SUPPORTED";
    detect(projectDir: string): Promise<boolean>;
    validate(projectDir: string): Promise<PlatformValidation>;
    generateBundle(projectDir: string, _outDir: string): Promise<string[]>;
}
//# sourceMappingURL=docker.d.ts.map