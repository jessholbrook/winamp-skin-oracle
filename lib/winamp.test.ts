import { describe, expect, it } from "vitest";
import {
  SKIN_H,
  SKIN_W,
  hexToRgb,
  safeFileName,
  seededRand,
  shade,
  shapePolygon,
} from "./winamp";

describe("seededRand", () => {
  it("is deterministic for the same seed", () => {
    const a = seededRand("television snow|teal velvet|fax machine");
    const b = seededRand("television snow|teal velvet|fax machine");
    const seqA = Array.from({ length: 20 }, a);
    const seqB = Array.from({ length: 20 }, b);
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    const a = Array.from({ length: 10 }, seededRand("seed-one"));
    const b = Array.from({ length: 10 }, seededRand("seed-two"));
    expect(a).not.toEqual(b);
  });

  it("stays in [0, 1)", () => {
    const rand = seededRand("range-check");
    for (let i = 0; i < 1000; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("color helpers", () => {
  it("hexToRgb parses channels", () => {
    expect(hexToRgb("#ff00aa")).toEqual([255, 0, 170]);
    expect(hexToRgb("#000000")).toEqual([0, 0, 0]);
    expect(hexToRgb("#ffffff")).toEqual([255, 255, 255]);
  });

  it("shade is identity at factor 1 and clamps at extremes", () => {
    expect(shade("#804020", 1)).toBe("#804020");
    expect(shade("#804020", 100)).toBe("#ffffff");
    expect(shade("#804020", 0)).toBe("#000000");
  });

  it("shade always emits a 6-digit hex color", () => {
    expect(shade("#010203", 0.5)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("safeFileName", () => {
  it("sanitizes to lowercase with underscores", () => {
    expect(safeFileName("My Skin!! v2")).toBe("my_skin_v2");
    expect(safeFileName("ChromeWasp v2")).toBe("chromewasp_v2");
  });

  it("keeps dashes and underscores", () => {
    expect(safeFileName("velvet_dial-tone")).toBe("velvet_dial-tone");
  });

  it("falls back to untitled for empty input", () => {
    expect(safeFileName("")).toBe("untitled");
  });
});

describe("shapePolygon", () => {
  it("returns null for the classic rectangle", () => {
    expect(shapePolygon("classic")).toBeNull();
    expect(shapePolygon(undefined)).toBeNull();
  });

  it.each(["rounded", "chamfered", "jagged", "melted"] as const)(
    "%s polygon stays within the skin bounds",
    (shape) => {
      const poly = shapePolygon(shape);
      expect(poly).not.toBeNull();
      expect(poly!.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of poly!) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(SKIN_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(SKIN_H);
      }
    },
  );

  it("jagged and melted edge loops terminate at x=0", () => {
    for (const shape of ["jagged", "melted"] as const) {
      const poly = shapePolygon(shape)!;
      expect(poly[poly.length - 1][0]).toBe(0);
    }
  });
});
