/**
 * HKD Mock Package Registry Client
 *
 * Implements an in-memory, fully-featured RegistryClient for tests,
 * offline simulation, and local package repository serving.
 */
import { HkdManifest } from "../index.js";
import { RegistryClient, PackageMetadata, DownloadResult, PublishResult, SearchResult } from "./registry-client.js";
export declare class MockRegistryClient implements RegistryClient {
    private packages;
    private archives;
    constructor();
    getPackageMetadata(rawName: string): Promise<PackageMetadata | null>;
    downloadPackage(rawName: string, version: string): Promise<DownloadResult>;
    publishPackage(manifest: HkdManifest, archiveBuf: Buffer, _token?: string): Promise<PublishResult>;
    searchPackages(query: string, limit?: number): Promise<SearchResult[]>;
    seedPackage(manifest: HkdManifest, archiveBuf: Buffer): void;
}
//# sourceMappingURL=registry-mock.d.ts.map