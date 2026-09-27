/**
 * HKD Package Registry Client Interface
 *
 * Defines the pluggable protocol abstraction for interacting with package registries.
 */
import { HkdManifest } from "../index.js";
export interface PackageVersionInfo {
    version: string;
    checksum: string;
    dependencies: Record<string, string>;
    publishedAt: string;
    author?: string;
}
export interface PackageMetadata {
    name: string;
    description?: string;
    versions: Record<string, PackageVersionInfo>;
    distTags: Record<string, string>;
}
export interface SearchResult {
    name: string;
    version: string;
    description: string;
    author?: string;
}
export interface DownloadResult {
    buffer: Buffer;
    checksum: string;
}
export interface PublishResult {
    ok: boolean;
    message: string;
}
export interface RegistryClient {
    getPackageMetadata(name: string): Promise<PackageMetadata | null>;
    downloadPackage(name: string, version: string): Promise<DownloadResult>;
    publishPackage(manifest: HkdManifest, archiveBuf: Buffer, token?: string): Promise<PublishResult>;
    searchPackages(query: string, limit?: number): Promise<SearchResult[]>;
}
//# sourceMappingURL=registry-client.d.ts.map