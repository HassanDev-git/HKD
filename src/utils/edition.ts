import * as fs from "fs";
import * as path from "path";

export type LanguageEdition = "2026" | "2027";

export const SUPPORTED_EDITIONS: readonly LanguageEdition[] = ["2026", "2027"] as const;
export const DEFAULT_EDITION: LanguageEdition = "2026";

/**
 * Returns true if the provided value is a supported LanguageEdition.
 */
export function isValidEdition(value: unknown): value is LanguageEdition {
  return value === "2026" || value === "2027";
}

/**
 * Parses and validates an edition string.
 * Defaults to "2026" if value is undefined or empty.
 * Throws an Error with a clean diagnostic if the edition is not supported.
 */
export function parseEdition(value: string | undefined | null): LanguageEdition {
  if (!value) return DEFAULT_EDITION;
  const clean = value.trim();
  if (isValidEdition(clean)) {
    return clean;
  }
  throw new Error(
    `Unsupported edition '${value}'. Supported editions are: ${SUPPORTED_EDITIONS.map((e) => `"${e}"`).join(", ")}.`
  );
}

/**
 * Detects the edition of a source file by looking for an enclosing hkd.toml.
 * Defaults to DEFAULT_EDITION ("2026") if no hkd.toml is found or edition is not specified.
 */
export function detectFileEdition(filePath: string): LanguageEdition {
  try {
    const abs = path.resolve(filePath);
    let dir = path.dirname(abs);
    while (dir && dir !== path.dirname(dir)) {
      const tomlPath = path.join(dir, "hkd.toml");
      if (fs.existsSync(tomlPath)) {
        const content = fs.readFileSync(tomlPath, "utf-8");
        if (/edition\s*=\s*"2027"/.test(content)) {
          return "2027";
        }
        break;
      }
      dir = path.dirname(dir);
    }
  } catch {}
  return DEFAULT_EDITION;
}
