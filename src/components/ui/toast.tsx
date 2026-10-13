"use client";

import { CheckCircle2, AlertTriangle, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; title: string; tone: "success" | "error" | "info" };
const Ctx = createContext<(t: Omit<Toast, "id">) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((toast: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...toast, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 6000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--emergency-bar-h)+12px)] z-[58] flex flex-col items-center gap-2 px-4 md:bottom-4">
        {items.map((item) => (
          <div
            key={item.id}
            role={item.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-control border bg-surface p-3 shadow-lg",
              item.tone === "error" ? "border-emergency" : item.tone === "success" ? "border-confirmed" : "border-border",
            )}
          >
            {item.tone === "error" ? <AlertTriangle aria-hidden="true" className="h-5 w-5 text-emergency" /> : <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-confirmed" />}
            <p className="flex-1">{item.title}</p>
            <button type="button" aria-label={t("dismiss")} onClick={() => setItems((xs) => xs.filter((x) => x.id !== item.id))} className="rounded p-1">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
