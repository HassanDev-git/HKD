/**
 * HKD Production HTTP Package Registry Client
 *
 * Implements the standard HKD Registry Protocol over HTTP/HTTPS with timeout handling,
 * authentication headers, and network resilience.
 */
import { HkdManifest } from "../index.js";
import { RegistryClient, PackageMetadata, DownloadResult, PublishResult, SearchResult } from "./registry-client.js";
export interface HttpRegistryOptions {
    registryUrl?: string;
    timeoutMs?: number;
    token?: string;
}
export declare class HttpRegistryClient implements RegistryClient {
    registryUrl: string;
    timeoutMs: number;
    token?: string;
    constructor(options?: HttpRegistryOptions);
    private request;
    getPackageMetadata(rawName: string): Promise<PackageMetadata | null>;
    downloadPackage(rawName: string, version: string): Promise<DownloadResult>;
    publishPackage(manifest: HkdManifest, archiveBuf: Buffer, token?: string): Promise<PublishResult>;
    searchPackages(query: string, limit?: number): Promise<SearchResult[]>;
}
//# sourceMappingURL=registry-http.d.ts.map