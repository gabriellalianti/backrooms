import { normaliseProductName } from "./product-matching";

export interface ParsedSheetProduct {
  sourceRow: number;
  name: string;
  normalizedName: string;
  location: string | null;
}

export class CatalogueParseError extends Error {
  constructor(
    message: string,
    readonly rows: number[],
  ) {
    super(message);
    this.name = "CatalogueParseError";
  }
}

/** Parses a Sheet A2:B snapshot. Cells after column B are deliberately ignored. */
export function parseSheetRows(rows: readonly (readonly unknown[])[]): ParsedSheetProduct[] {
  const parsed: ParsedSheetProduct[] = [];
  const rowsByName = new Map<string, number[]>();

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const name = String(row[0] ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (!name) return;
    const locationValue = String(row[1] ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (name.length > 300) {
      throw new CatalogueParseError("Product names must be 300 characters or fewer.", [sourceRow]);
    }
    if (locationValue.length > 100) {
      throw new CatalogueParseError("Locker locations must be 100 characters or fewer.", [sourceRow]);
    }
    const normalizedName = normaliseProductName(name);
    const duplicateRows = rowsByName.get(normalizedName) ?? [];
    duplicateRows.push(sourceRow);
    rowsByName.set(normalizedName, duplicateRows);
    parsed.push({ sourceRow, name, normalizedName, location: locationValue || null });
  });

  const duplicate = [...rowsByName.entries()].find(([, sourceRows]) => sourceRows.length > 1);
  if (duplicate) {
    throw new CatalogueParseError(
      `Duplicate product name after normalisation: ${duplicate[0]}`,
      duplicate[1],
    );
  }
  return parsed;
}
