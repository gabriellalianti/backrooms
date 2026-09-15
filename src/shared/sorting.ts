import type { Product } from "./types";

const collator = new Intl.Collator("en-AU", { numeric: true, sensitivity: "base" });

interface LockerKey {
  group: number;
  number: number;
  suffix: string;
}

function lockerKey(location: string | null | undefined): LockerKey {
  const normalized = location?.trim().toLocaleUpperCase("en-AU") ?? "";

  if (!normalized || normalized === "N/A") return { group: 3, number: 0, suffix: "" };
  if (normalized === "STALL") return { group: 0, number: 0, suffix: "" };

  const numberedLocker = normalized.match(/^(\d+)\s*(.*)$/);
  if (numberedLocker) {
    return {
      group: 1,
      number: Number.parseInt(numberedLocker[1], 10),
      suffix: numberedLocker[2],
    };
  }

  return { group: 2, number: 0, suffix: normalized };
}

export function compareAlphabetically(a: string, b: string) {
  return collator.compare(a, b);
}

export function compareByLocker(
  aLocation: string | null | undefined,
  bLocation: string | null | undefined,
  aName = "",
  bName = "",
) {
  const a = lockerKey(aLocation);
  const b = lockerKey(bLocation);

  return (
    a.group - b.group
    || a.number - b.number
    || collator.compare(a.suffix, b.suffix)
    || collator.compare(aName, bName)
  );
}

export function compareProductsByLocker(a: Product, b: Product) {
  return compareByLocker(a.location, b.location, a.name, b.name);
}
