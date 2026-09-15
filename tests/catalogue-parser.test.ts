import { describe, expect, it } from "vitest";
import { CatalogueParseError, parseSheetRows } from "../src/shared/catalogue-parser";

describe("parseSheetRows", () => {
  it("reads only columns A and B, trims values, and records actual row numbers", () => {
    expect(
      parseSheetRows([
        ["9x15cm Veroboard", "17G", "a private note that must not be imported"],
        ["AA battery", " 18A "],
        ["Amber LED - clear", "13E", "formula result", "more notes"],
        ["N20 Motor 1000 rpm @ 6V 9.7g", "STALL"],
        ["XT 60 connectors", "18D"],
      ]),
    ).toEqual([
      { sourceRow: 2, name: "9x15cm Veroboard", normalizedName: "9x15cm veroboard", location: "17G" },
      { sourceRow: 3, name: "AA battery", normalizedName: "aa battery", location: "18A" },
      { sourceRow: 4, name: "Amber LED - clear", normalizedName: "amber led - clear", location: "13E" },
      { sourceRow: 5, name: "N20 Motor 1000 rpm @ 6V 9.7g", normalizedName: "n20 motor 1000 rpm @ 6v 9.7g", location: "STALL" },
      { sourceRow: 6, name: "XT 60 connectors", normalizedName: "xt 60 connectors", location: "18D" },
    ]);
  });

  it("skips blank names and represents a blank location as null/N/A", () => {
    expect(parseSheetRows([["", "18Z"], ["Ultrasonic Sensor", ""]])).toEqual([
      { sourceRow: 3, name: "Ultrasonic Sensor", normalizedName: "ultrasonic sensor", location: null },
    ]);
  });

  it("rejects duplicate normalized names with their Sheet rows", () => {
    expect(() => parseSheetRows([["AA battery", "18A"], [" aa   battery ", "18B"]])).toThrow(
      CatalogueParseError,
    );
    try {
      parseSheetRows([["AA battery", "18A"], [" aa   battery ", "18B"]]);
    } catch (error) {
      expect((error as CatalogueParseError).rows).toEqual([2, 3]);
    }
  });

  it("rejects unexpectedly large names or locker values", () => {
    expect(() => parseSheetRows([["x".repeat(301), "18A"]])).toThrow("300 characters");
    expect(() => parseSheetRows([["AA battery", "x".repeat(101)]])).toThrow("100 characters");
  });
});
