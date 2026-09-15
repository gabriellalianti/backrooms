import type { Product } from "../shared/types";

export function ProductImage({ product, compact = false }: { product: Product | null; compact?: boolean }) {
  const className = compact ? "product-image product-image--compact" : "product-image";
  if (product?.imageUrl) {
    return <img className={className} src={product.imageUrl} alt={product.name} loading="lazy" />;
  }
  return (
    <div className={`${className} product-image--placeholder`} aria-label="Product image unavailable">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M8 13h32v25H8z" />
        <circle cx="18" cy="22" r="4" />
        <path d="m11 34 9-8 7 6 5-5 6 7" />
      </svg>
    </div>
  );
}

