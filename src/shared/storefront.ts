const storefrontOrigin = "https://store.createunsw.com.au";

export interface StorefrontMetadata {
  title: string;
  pageUrl: string;
  imageUrl: string | null;
  priceCents: number;
}

/** Mirrors the store's SEO URL pattern for catalogue names. */
export function storefrontSlug(productName: string): string {
  return productName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-AU")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveStorefrontPageUrl(productName: string): string | null {
  const slug = storefrontSlug(productName);
  return slug ? `${storefrontOrigin}/${slug}` : null;
}

export function isAllowedStorefrontUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "store.createunsw.com.au"
      && url.port === ""
      && url.username === ""
      && url.password === "";
  } catch {
    return false;
  }
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function plainText(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function elementTextWithClass(html: string, className: string, allowedTags: string[]): string | null {
  const tags = allowedTags.join("|");
  const expression = new RegExp(`<(${tags})\\b[^>]*>`, "gi");
  for (const match of html.matchAll(expression)) {
    const classes = (attribute(match[0], "class") ?? "").split(/\s+/);
    if (!classes.includes(className)) continue;
    const contentStart = (match.index ?? 0) + match[0].length;
    const closingTag = `</${match[1].toLowerCase()}>`;
    const contentEnd = html.toLowerCase().indexOf(closingTag, contentStart);
    if (contentEnd >= 0) return plainText(html.slice(contentStart, contentEnd));
  }
  return null;
}

function attribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeHtml(match[2]) : null;
}

function parseAudPrice(value: string): number | null {
  const match = value.match(/(?:A\s*)?\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
  if (!match) return null;
  const [dollars, decimal = ""] = match[1].replace(/,/g, "").split(".");
  const cents = Number.parseInt(dollars, 10) * 100 + Number.parseInt(decimal.padEnd(2, "0") || "0", 10);
  return Number.isSafeInteger(cents) ? cents : null;
}

function mainProductImage(html: string, pageUrl: string): string | null {
  const mainImageStart = html.search(/class\s*=\s*(["'])[^"']*\bmain-image\b[^"']*\1/i);
  if (mainImageStart < 0) return null;
  const imageTag = html.slice(mainImageStart, mainImageStart + 30_000).match(/<img\b[^>]*>/i)?.[0];
  const source = imageTag ? attribute(imageTag, "src") : null;
  if (!source) return null;
  try {
    const imageUrl = new URL(source, pageUrl);
    return isAllowedStorefrontUrl(imageUrl.toString()) ? imageUrl.toString() : null;
  } catch {
    return null;
  }
}

function sectionFromClass(html: string, className: string, maximumLength: number): string | null {
  const expression = new RegExp(`class\\s*=\\s*(["'])[^"']*\\b${className}\\b[^"']*\\1`, "i");
  const start = html.search(expression);
  return start < 0 ? null : html.slice(start, start + maximumLength);
}

/** Parses only the main product area, avoiding prices and images from recommendation carousels. */
export function parseStorefrontProductPage(
  html: string,
  pageUrl: string,
  expectedProductName: string,
): StorefrontMetadata {
  if (!isAllowedStorefrontUrl(pageUrl) || !/\broute-product-product\b/i.test(html)) {
    throw new Error("The storefront response was not a product page");
  }

  const title = elementTextWithClass(html, "page-title", ["h1"]);
  if (!title || storefrontSlug(title) !== storefrontSlug(expectedProductName)) {
    throw new Error("The storefront product title did not match the catalogue name");
  }

  const priceSection = sectionFromClass(html, "product-price-group", 10_000);
  if (!priceSection) throw new Error("The storefront product price was unavailable");
  const salePrice = elementTextWithClass(priceSection, "product-price-new", ["div", "span"]);
  const regularPrice = elementTextWithClass(priceSection, "product-price", ["div", "span"]);
  const priceCents = parseAudPrice(salePrice ?? regularPrice ?? "");
  if (priceCents === null) throw new Error("The storefront product price was unavailable");

  return {
    title,
    pageUrl,
    imageUrl: mainProductImage(html, pageUrl),
    priceCents,
  };
}
