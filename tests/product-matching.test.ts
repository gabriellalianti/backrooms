import { describe, expect, it } from "vitest";
import { matchProduct, productNameCandidates } from "../src/shared/product-matching";

const products = [
  { id: "motor-driver", name: "Big Motor Driver" },
  { id: "bluetooth", name: "Bluetooth Module (HC-05)" },
  { id: "battery", name: "9V battery" },
];

describe("product matching", () => {
  it("removes trailing parenthetical model metadata", () => {
    expect(matchProduct({ rawName: "Big Motor Driver (   L298N)" }, products)).toMatchObject({
      status: "parenthetical",
      product: products[0],
    });
  });

  it("removes only as many repeated suffixes as needed", () => {
    expect(matchProduct({ rawName: "Bluetooth Module (HC-05) (HC-05)" }, products)).toMatchObject({
      status: "parenthetical",
      product: products[1],
    });
  });

  it("normalises non-breaking whitespace in N/A suffixes", () => {
    expect(productNameCandidates("9V battery (\u00a0  N/A)")).toContain("9v battery");
  });

  it("flags duplicate catalogue names as ambiguous", () => {
    expect(
      matchProduct(
        { rawName: "Big Motor Driver (L298N)" },
        [...products, { id: "duplicate", name: "Big Motor Driver" }],
      ).status,
    ).toBe("ambiguous");
  });

  it("never fuzzy-matches a different name", () => {
    expect(matchProduct({ rawName: "Motor Driver" }, products).status).toBe("unmatched");
  });
});

