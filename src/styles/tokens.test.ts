import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const token = (name: string) => {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`missing token --${name}`);
  return m[1]!;
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

// [foreground, background, minimum ratio]
const PAIRS: [string, string, number][] = [
  ["text", "bg", 4.5],
  ["text", "surface", 4.5],
  ["text-muted", "bg", 4.5],
  ["text-muted", "surface", 4.5],
  ["primary", "surface", 4.5],
  ["primary", "bg", 4.5],
  ["accent-strong", "surface", 4.5],
  ["confirmed", "surface", 4.5],
  ["reported-text", "surface", 4.5],
  ["unknown", "surface", 4.5],
  ["emergency", "surface", 4.5],
  ["reported", "surface", 3], // icons and borders only
  ["accent", "surface", 3], // icons and highlights only
  ["border-strong", "surface", 3], // input outlines
  ["focus", "bg", 3],
  // Badge and banner text on tinted backgrounds
  ["confirmed", "confirmed-bg", 4.5],
  ["reported-text", "reported-bg", 4.5],
  ["unknown", "unknown-bg", 4.5],
  ["emergency", "emergency-bg", 4.5],
  ["primary-hover", "primary-bg", 4.5],
  ["text", "primary-bg", 4.5],
];

describe("design tokens meet WCAG AA", () => {
  it.each(PAIRS)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(min);
  });

  it("white text on emergency, primary and accent-strong fills ≥ 4.5:1", () => {
    for (const fill of ["emergency", "primary", "accent-strong", "text"]) {
      expect(contrast("#ffffff", token(fill)), fill).toBeGreaterThanOrEqual(4.5);
    }
  });
});
