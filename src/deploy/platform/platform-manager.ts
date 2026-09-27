/**
 * HKD Platform Adapter Abstraction & Registry
 */

export type PlatformSupportTier = "SUPPORTED" | "EXPERIMENTAL" | "NOT SUPPORTED";

export interface PlatformValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export interface PlatformAdapter {
  readonly id: string;
  readonly name: string;
  readonly tier: PlatformSupportTier;
  detect(projectDir: string): Promise<boolean>;
  validate(projectDir: string): Promise<PlatformValidation>;
  generateBundle(projectDir: string, outDir: string): Promise<string[]>;
}

export class PlatformRegistry {
  private adapters = new Map<string, PlatformAdapter>();

  public register(adapter: PlatformAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public get(id: string): PlatformAdapter | undefined {
    return this.adapters.get(id);
  }

  public getAll(): PlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  public async detectActive(projectDir: string): Promise<PlatformAdapter[]> {
    const active: PlatformAdapter[] = [];
    for (const a of this.adapters.values()) {
      if (await a.detect(projectDir)) {
        active.push(a);
      }
    }
    return active;
  }
}
