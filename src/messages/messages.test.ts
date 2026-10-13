import { describe, expect, it } from "vitest";
import en from "./en.json";
import hi from "./hi.json";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

describe("messages", () => {
  it("hi.json has exactly the same keys as en.json", () => {
    expect(keys(hi).sort()).toEqual(keys(en).sort());
  });

  it("every Hindi string keeps the same {placeholders}", () => {
    const get = (o: unknown, path: string) => path.split(".").reduce((a: any, k) => a?.[k], o) as string;
    for (const k of keys(en)) expect(placeholders(get(hi, k)), k).toEqual(placeholders(get(en, k)));
  });

  it("has no empty strings", () => {
    const get = (o: unknown, path: string) => path.split(".").reduce((a: any, k) => a?.[k], o) as string;
    for (const k of keys(hi)) expect(get(hi, k).trim(), k).not.toBe("");
  });
});
