"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Large +/- number input (56 px targets). Keyboard: arrows, Page Up/Down (5),
 * Home/End. Press and hold +/- to repeat. Clamped to 0..max (capacity).
 */
export function StatStepper({
  label,
  value,
  max,
  onChange,
  previous,
  warn,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  previous?: number | null;
  warn?: string | null;
}) {
  const t = useTranslations("portal.stepper");
  const id = useId();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const set = (v: number) => onChange(clamp(v));
  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);
  const hold = (delta: number) => {
    set(valueRef.current + delta);
    stop();
    const start = Date.now();
    timer.current = setInterval(() => {
      if (Date.now() - start > 400) set(valueRef.current + delta);
    }, 120);
  };
  const btn = "flex h-14 w-14 shrink-0 items-center justify-center rounded-control border-2 border-primary text-primary disabled:opacity-40";

  return (
    <div className="space-y-2 rounded-card border border-border bg-surface p-4">
      <label htmlFor={id} className="block text-lg font-semibold">{label}</label>
      <div className="flex items-center gap-3">
        <button type="button" className={btn} aria-label={t("decrease", { label })} disabled={value <= 0} onPointerDown={() => hold(-1)} onPointerUp={stop} onPointerLeave={stop} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), set(value - 1))}>
          <Minus aria-hidden="true" className="h-7 w-7" />
        </button>
        <input
          id={id}
          role="spinbutton"
          inputMode="numeric"
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-describedby={`${id}-cap`}
          value={value}
          onChange={(e) => set(Number(e.target.value.replace(/\D/g, "")) || 0)}
          onKeyDown={(e) => {
            const map: Record<string, number> = { ArrowUp: 1, ArrowDown: -1, PageUp: 5, PageDown: -5 };
            if (e.key in map) (e.preventDefault(), set(value + map[e.key]!));
            if (e.key === "Home") (e.preventDefault(), set(0));
            if (e.key === "End") (e.preventDefault(), set(max));
          }}
          className="h-14 w-24 rounded-control border border-border-strong text-center text-3xl font-bold"
        />
        <button type="button" className={btn} aria-label={t("increase", { label })} disabled={value >= max} onPointerDown={() => hold(1)} onPointerUp={stop} onPointerLeave={stop} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), set(value + 1))}>
          <Plus aria-hidden="true" className="h-7 w-7" />
        </button>
      </div>
      <p id={`${id}-cap`} className="text-sm text-muted">
        {t("capacity", { max })}
        {previous !== undefined && previous !== null ? ` · ${t("previous", { value: previous })}` : ""}
      </p>
      {warn ? <p className={cn("text-sm font-medium text-reported-text")}>{warn}</p> : null}
    </div>
  );
}
