import {
  deriveStorefrontPageUrl,
  isAllowedStorefrontUrl,
  parseStorefrontProductPage,
  type StorefrontMetadata,
} from "../shared/storefront";

const maximumPageBytes = 2_000_000;
const maximumAttemptsPerUrl = 2;

class StorefrontHttpError extends Error {
  constructor(readonly status: number) {
    super(`Storefront returned HTTP ${status}`);
  }
}

function isTransientStorefrontError(error: unknown): boolean {
  if (error instanceof StorefrontHttpError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }
  if (error instanceof TypeError) return true;
  return error instanceof DOMException
    && (error.name === "AbortError" || error.name === "TimeoutError");
}

export async function fetchStorefrontMetadata(
  productName: string,
  cachedPageUrl: string | null,
  fetcher: typeof fetch = fetch,
): Promise<StorefrontMetadata> {
  const derivedPageUrl = deriveStorefrontPageUrl(productName);
  const candidates = [...new Set([cachedPageUrl, derivedPageUrl])]
    .filter((value): value is string => Boolean(value) && isAllowedStorefrontUrl(value!));
  if (!candidates.length) throw new Error("No safe storefront URL could be derived");

  let lastError: unknown = null;
  for (const candidate of candidates) {
    for (let attempt = 1; attempt <= maximumAttemptsPerUrl; attempt += 1) {
      try {
        const response = await fetcher(candidate, {
          redirect: "follow",
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent": "Backrooms catalogue refresh",
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (!response.ok) throw new StorefrontHttpError(response.status);
        if (!response.url || !isAllowedStorefrontUrl(response.url)) {
          throw new Error("Storefront redirected to an unexpected URL");
        }
        const contentType = response.headers.get("Content-Type") ?? "";
        if (!contentType.toLowerCase().includes("text/html")) {
          throw new Error("Storefront did not return HTML");
        }
        const declaredLength = Number(response.headers.get("Content-Length") ?? "0");
        if (declaredLength > maximumPageBytes) throw new Error("Storefront page was too large");
        const html = await response.text();
        if (html.length > maximumPageBytes) throw new Error("Storefront page was too large");
        return parseStorefrontProductPage(html, response.url, productName);
      } catch (error) {
        lastError = error;
        if (attempt === maximumAttemptsPerUrl || !isTransientStorefrontError(error)) break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Storefront metadata could not be fetched");
}
