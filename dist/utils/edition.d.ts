export type LanguageEdition = "2026" | "2027";
export declare const SUPPORTED_EDITIONS: readonly LanguageEdition[];
export declare const DEFAULT_EDITION: LanguageEdition;
/**
 * Returns true if the provided value is a supported LanguageEdition.
 */
export declare function isValidEdition(value: unknown): value is LanguageEdition;
/**
 * Parses and validates an edition string.
 * Defaults to "2026" if value is undefined or empty.
 * Throws an Error with a clean diagnostic if the edition is not supported.
 */
export declare function parseEdition(value: string | undefined | null): LanguageEdition;
/**
 * Detects the edition of a source file by looking for an enclosing hkd.toml.
 * Defaults to DEFAULT_EDITION ("2026") if no hkd.toml is found or edition is not specified.
 */
export declare function detectFileEdition(filePath: string): LanguageEdition;
//# sourceMappingURL=edition.d.ts.map