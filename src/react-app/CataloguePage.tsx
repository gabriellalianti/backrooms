import { useEffect, useMemo, useState } from "react";
import type { Product } from "../shared/types";
import { compareAlphabetically, compareProductsByLocker } from "../shared/sorting";
import { api } from "./api";
import { formatDateTime, formatMoney } from "./format";
import { ProductImage } from "./ProductImage";

export function CataloguePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<"locker" | "alphabetical">("locker");

  useEffect(() => {
    api<{ products: Product[] }>("/api/catalogue")
      .then((result) => setProducts(result.products))
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-AU");
    const matching = needle
      ? products.filter((product) => product.name.toLocaleLowerCase("en-AU").includes(needle))
      : products;

    return [...matching].sort(
      sort === "locker"
        ? compareProductsByLocker
        : (a, b) => compareAlphabetically(a.name, b.name),
    );
  }, [products, query, sort]);

  return (
    <main className="page-shell">
      <section className="page-heading">
        <h1>Parts catalogue</h1>
        <div className="count-badge" aria-live="polite">
          <strong>{filtered.length}</strong>
          <span>{filtered.length === 1 ? "part" : "parts"}</span>
        </div>
      </section>

      <div className="catalogue-toolbar">
        <label className="search-box">
          <span className="sr-only">Search products</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></svg>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by component name…"
            autoFocus
          />
          {query && <button className="clear-search" onClick={() => setQuery("")} aria-label="Clear search">×</button>}
        </label>
        <div className="sort-control" role="group" aria-label="Sort products">
          <span>Sort</span>
          <button className={sort === "locker" ? "active" : ""} aria-pressed={sort === "locker"} onClick={() => setSort("locker")}>Locker</button>
          <button className={sort === "alphabetical" ? "active" : ""} aria-pressed={sort === "alphabetical"} onClick={() => setSort("alphabetical")}>A–Z</button>
        </div>
      </div>

      {loading && <div className="notice">Loading catalogue…</div>}
      {error && <div className="notice notice--error">{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div className="empty-state"><strong>No matching parts</strong><span>Try a shorter product name.</span></div>
      )}

      <section className="product-grid" aria-label="Products">
        {filtered.map((product) => (
          <article className="product-card" key={product.id}>
            <ProductImage product={product} />
            <div className="product-card__body">
              <div className="product-card__topline">
                <span className={`metadata-dot metadata-dot--${product.metadataState}`} />
                {product.metadataState === "last_known" ? "Last-known listing" : product.metadataState === "current" ? "Current listing" : "Listing unavailable"}
              </div>
              <h2>{product.name}</h2>
              <div className="product-facts">
                <div><span>Locker</span><strong className="location">{product.location ?? "N/A"}</strong></div>
                <div><span>{product.metadataState === "last_known" ? "Last price" : "Price"}</span><strong>{formatMoney(product.priceCents)}</strong></div>
              </div>
              <div className="product-card__footer">
                <small>{product.metadataRefreshedAt ? `Checked ${formatDateTime(product.metadataRefreshedAt)}` : "Not refreshed yet"}</small>
                {product.pageUrl ? <a href={product.pageUrl} target="_blank" rel="noreferrer">View listing <span aria-hidden="true">↗</span></a> : <span className="muted-link">No public listing</span>}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
