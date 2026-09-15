import { describe, expect, it, vi } from "vitest";
import {
  deriveStorefrontPageUrl,
  isAllowedStorefrontUrl,
  parseStorefrontProductPage,
  storefrontSlug,
} from "../src/shared/storefront";
import { fetchStorefrontMetadata } from "../src/worker/storefront-fetch";

describe("storefront URL derivation", () => {
  it.each([
    ["N20 Motor 1000 rpm @ 6V 9.7g", "n20-motor-1000-rpm-6v-9-7g"],
    ['2.4" Arduino Touchscreen Module', "2-4-arduino-touchscreen-module"],
    ["9V battery clip - bare wires", "9v-battery-clip-bare-wires"],
    ["Arduino Leonardo (Compatible)", "arduino-leonardo-compatible"],
    ["150mm Digital Caliper", "150mm-digital-caliper"],
    ["555 Timer", "555-timer"],
    ["3296 Potentiometer", "3296-potentiometer"],
    ["12x18cm Veroboard", "12x18cm-veroboard"],
    ["6 AA Battery Holders", "6-aa-battery-holders"],
  ])("converts %s to the store slug %s", (name, expected) => {
    expect(storefrontSlug(name)).toBe(expected);
  });

  it("retries a transient storefront request failure", async () => {
    const pageUrl = "https://store.createunsw.com.au/555-timer";
    const html = `
      <html class="route-product-product">
        <h1 class="page-title">555 Timer</h1>
        <div class="main-image"><img src="/image/555.jpg"></div>
        <div class="product-price-group"><div class="product-price">$1.50</div></div>
      </html>`;
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("temporary connection failure"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        url: pageUrl,
        headers: new Headers({ "Content-Type": "text/html" }),
        text: async () => html,
      } as Response);

    await expect(fetchStorefrontMetadata("555 Timer", null, fetcher)).resolves.toMatchObject({
      pageUrl,
      priceCents: 150,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("builds a page URL on the fixed CREATE storefront origin", () => {
    expect(deriveStorefrontPageUrl("Arduino Leonardo (Compatible)"))
      .toBe("https://store.createunsw.com.au/arduino-leonardo-compatible");
  });

  it("does not create a URL when a name has no usable characters", () => {
    expect(deriveStorefrontPageUrl("@ ()")).toBeNull();
  });

  it("extracts the square main image and product price without reading recommendation cards", () => {
    const html = `
      <html class="route-product-product">
        <h1 class="title page-title"><span>N20 Motor 1000 rpm @ 6V 9.7g</span></h1>
        <div class="swiper main-image"><div><img src="/image/cache/catalog/n20-550x550.jpg"></div></div>
        <div class="recommendation"><div class="product-price">$99.00</div></div>
        <div class="product-price-group"><div class="price-group"><div class="product-price">$7.00</div></div></div>
      </html>`;
    expect(parseStorefrontProductPage(
      html,
      "https://store.createunsw.com.au/n20-motor-1000-rpm-6v-9-7g",
      "N20 Motor 1000 rpm @ 6V 9.7g",
    )).toEqual({
      title: "N20 Motor 1000 rpm @ 6V 9.7g",
      pageUrl: "https://store.createunsw.com.au/n20-motor-1000-rpm-6v-9-7g",
      imageUrl: "https://store.createunsw.com.au/image/cache/catalog/n20-550x550.jpg",
      priceCents: 700,
    });
  });

  it("prefers a current sale price and decodes product titles", () => {
    const html = `
      <html class="route-product-product">
        <h1 class="page-title">2.4&quot; Arduino Touchscreen Module</h1>
        <div class="main-image"><img src="https://store.createunsw.com.au/image/touchscreen.jpg"></div>
        <div class="product-price-group price-group">
          <div class="product-price">$20.00</div>
          <div class="product-price-new">$12.50</div>
        </div>
      </html>`;
    expect(parseStorefrontProductPage(
      html,
      "https://store.createunsw.com.au/2-4-arduino-touchscreen-module",
      '2.4" Arduino Touchscreen Module',
    ).priceCents).toBe(1250);
  });

  it("rejects non-product pages, mismatched titles, and unsafe hosts", () => {
    expect(isAllowedStorefrontUrl("https://store.createunsw.com.au/a-product")).toBe(true);
    expect(isAllowedStorefrontUrl("http://store.createunsw.com.au/a-product")).toBe(false);
    expect(isAllowedStorefrontUrl("https://store.createunsw.com.au.evil.example/a-product")).toBe(false);
    expect(() => parseStorefrontProductPage(
      '<html><h1 class="page-title">Product</h1><div class="product-price">$1.00</div></html>',
      "https://store.createunsw.com.au/product",
      "Product",
    )).toThrow("not a product page");
    expect(() => parseStorefrontProductPage(
      '<html class="route-product-product"><h1 class="page-title">Wrong product</h1><div class="product-price">$1.00</div></html>',
      "https://store.createunsw.com.au/product",
      "Product",
    )).toThrow("did not match");
  });
});
