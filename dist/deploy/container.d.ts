/**
 * HKD Containerization & Docker Engine
 *
 * Generates multi-stage, hardened Dockerfiles and .dockerignore files,
 * enforcing non-root execution, minimal image layers, and zero secret leakage.
 */
export interface ContainerConfig {
    port?: number;
    entry?: string;
    target?: string;
    baseImage?: string;
}
export declare function generateDockerfile(config?: ContainerConfig): string;
export declare function generateDockerignore(): string;
export declare function initContainer(projectDir: string, config?: ContainerConfig): {
    dockerfile: string;
    dockerignore: string;
};
//# sourceMappingURL=container.d.ts.map