import { describe, expect, it } from "vitest";
import { compareAlphabetically, compareByLocker } from "../src/shared/sorting";

describe("locker sorting", () => {
  it("sorts the stall first, then lockers naturally, then names and unknowns", () => {
    const parts = [
      { name: "Unknown", location: null },
      { name: "Eighteen D", location: "18D" },
      { name: "Store room", location: "Workshop" },
      { name: "Thirteen E", location: "13E" },
      { name: "Stall part", location: "STALL" },
      { name: "Nine B", location: "9B" },
      { name: "Nine A", location: "9A" },
      { name: "Explicit unknown", location: "N/A" },
    ];

    expect(parts.sort((a, b) => compareByLocker(a.location, b.location, a.name, b.name)))
      .toEqual([
        { name: "Stall part", location: "STALL" },
        { name: "Nine A", location: "9A" },
        { name: "Nine B", location: "9B" },
        { name: "Thirteen E", location: "13E" },
        { name: "Eighteen D", location: "18D" },
        { name: "Store room", location: "Workshop" },
        { name: "Explicit unknown", location: "N/A" },
        { name: "Unknown", location: null },
      ]);
  });

  it("uses natural alphabetical order", () => {
    expect(["Part 10", "part 2", "Amber"].sort(compareAlphabetically))
      .toEqual(["Amber", "part 2", "Part 10"]);
  });
});
