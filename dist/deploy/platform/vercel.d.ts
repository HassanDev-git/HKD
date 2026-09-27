/**
 * Vercel Platform Adapter (Experimental)
 *
 * Implements serverless bridge for Node.js based Vercel function routing.
 */
import { PlatformAdapter, PlatformValidation } from "./platform-manager.js";
export declare class VercelAdapter implements PlatformAdapter {
    readonly id = "vercel";
    readonly name = "Vercel Serverless (Node Bridge)";
    readonly tier: "EXPERIMENTAL";
    detect(projectDir: string): Promise<boolean>;
    validate(_projectDir: string): Promise<PlatformValidation>;
    generateBundle(projectDir: string, _outDir: string): Promise<string[]>;
}
//# sourceMappingURL=vercel.d.ts.map