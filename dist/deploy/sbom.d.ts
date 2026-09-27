/**
 * HKD Software Bill of Materials (SBOM) Generator
 *
 * Implements CycloneDX 1.5 JSON specification for supply-chain security,
 * listing application identity, dependencies, versions, and cryptographic hashes.
 */
export interface SbomComponent {
    type: "application" | "library" | "framework";
    name: string;
    version: string;
    description?: string;
    hashes?: Array<{
        alg: string;
        content: string;
    }>;
    licenses?: Array<{
        license: {
            id: string;
        };
    }>;
    purl?: string;
}
export interface CycloneDxSbom {
    bomFormat: "CycloneDX";
    specVersion: "1.5";
    serialNumber: string;
    version: number;
    metadata: {
        timestamp: string;
        tools: Array<{
            vendor: string;
            name: string;
            version: string;
        }>;
        component: SbomComponent;
    };
    components: SbomComponent[];
}
export declare function generateCycloneDxSbom(projectDir: string): CycloneDxSbom;
export declare function writeSbomJson(projectDir: string, outPath?: string): string;
//# sourceMappingURL=sbom.d.ts.map