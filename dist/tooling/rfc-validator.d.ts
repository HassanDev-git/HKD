/**
 * HKD RFC Validator & Tooling
 *
 * Implements: hkd rfc list | check | status
 * Inspects, parses, and verifies RFC proposals in the `rfcs/` directory.
 */
export interface RfcMetadata {
    id: string;
    title: string;
    status: "Draft" | "Proposed" | "Accepted" | "Experimental" | "Implemented";
    targetEdition: string;
    filePath: string;
    sections: string[];
    missingSections: string[];
    isValid: boolean;
}
export declare const MANDATORY_RFC_SECTIONS: string[];
export declare class RfcValidator {
    private readonly rfcsDir;
    constructor(rfcsDir: string);
    getAllRfcs(): RfcMetadata[];
    parseRfc(filePath: string): RfcMetadata;
    listRfcs(): string;
    checkRfc(idOrAll?: string): string;
    statusRfc(id?: string): string;
}
//# sourceMappingURL=rfc-validator.d.ts.map