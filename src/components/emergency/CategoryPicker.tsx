"use client";

import { useTranslations } from "next-intl";
import { useRef, type KeyboardEvent } from "react";
import { CATEGORIES, type Category } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS } from "./categoryIcons";

/** Six large tiles as a single-select radio group (arrow keys move and select). */
export function CategoryPicker({ value, onChange, error }: { value: Category | null; onChange: (c: Category) => void; error?: string }) {
  const t = useTranslations("categories");
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = value ? CATEGORIES.indexOf(value) : 0;

  function onKey(e: KeyboardEvent, i: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = (i + keys[e.key]! + CATEGORIES.length) % CATEGORIES.length;
    onChange(CATEGORIES[next]!);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="radiogroup" aria-labelledby="category-label" aria-describedby={error ? "category-err" : undefined} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c, i) => {
          const Icon = CATEGORY_ICONS[c];
          const selected = value === c;
          return (
            <button
              key={c}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={i === current ? 0 : -1}
              onClick={() => onChange(c)}
              onKeyDown={(e) => onKey(e, i)}
              className={cn(
                "flex min-h-[112px] flex-col items-start gap-1 rounded-card border-2 p-3 text-left transition-colors",
                selected ? "border-primary bg-tint-primary" : "border-border bg-surface hover:border-border-strong",
              )}
            >
              <Icon aria-hidden="true" className={cn("h-8 w-8", selected ? "text-primary" : "text-text")} />
              <span className="text-lg font-semibold leading-tight">{t(`${c}.title`)}</span>
              <span className="text-sm text-muted">{t(`${c}.hint`)}</span>
            </button>
          );
        })}
      </div>
      {error ? <p id="category-err" className="mt-2 text-sm font-medium text-emergency">{error}</p> : null}
    </div>
  );
}
