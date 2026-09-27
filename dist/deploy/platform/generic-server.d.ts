/**
 * Generic Linux Server Platform Adapter
 *
 * Generates systemd service units, deployment shell scripts, and health probes.
 */
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
export declare class GenericServerAdapter implements PlatformAdapter {
    readonly id = "generic-server";
    readonly name = "Generic Linux Server (systemd)";
    readonly tier: "SUPPORTED";
    detect(projectDir: string): Promise<boolean>;
    validate(projectDir: string): Promise<PlatformValidation>;
    generateBundle(projectDir: string, outDir: string): Promise<string[]>;
}
//# sourceMappingURL=generic-server.d.ts.map