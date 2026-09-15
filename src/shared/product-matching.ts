import type { MatchStatus, ParsedOrderItem } from "./types";

export interface MatchableProduct {
  id: string;
  name: string;
}

export interface ProductMatch {
  status: MatchStatus;
  product: MatchableProduct | null;
  candidates: MatchableProduct[];
}

export function normaliseProductName(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-AU");
}

export function productNameCandidates(value: string): string[] {
  const candidates: string[] = [];
  let candidate = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();

  while (candidate) {
    candidates.push(normaliseProductName(candidate));
    const stripped = candidate.replace(/\s*\([^()]*\)\s*$/, "").trim();
    if (stripped === candidate) break;
    candidate = stripped;
  }

  return [...new Set(candidates)];
}

export function matchProduct(
  item: Pick<ParsedOrderItem, "rawName">,
  products: MatchableProduct[],
): ProductMatch {
  const candidates = productNameCandidates(item.rawName);

  for (let level = 0; level < candidates.length; level += 1) {
    const matching = products.filter(
      (product) => normaliseProductName(product.name) === candidates[level],
    );
    if (matching.length === 1) {
      return {
        status: level === 0 ? "exact" : "parenthetical",
        product: matching[0],
        candidates: matching,
      };
    }
    if (matching.length > 1) {
      return { status: "ambiguous", product: null, candidates: matching };
    }
  }

  return { status: "unmatched", product: null, candidates: [] };
}

