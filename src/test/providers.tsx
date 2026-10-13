import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";

/** Renders with intl, a fresh QueryClient, tooltips and toasts (no auth provider; mock useAuth where needed). */
export function renderApp(ui: ReactElement, { locale = "en", ...opts }: RenderOptions & { locale?: "en" | "hi" } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : hi} timeZone="Asia/Kolkata">
        <QueryClientProvider client={qc}>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </QueryClientProvider>
      </NextIntlClientProvider>
    );
  }
  return { qc, ...render(ui, { wrapper: Wrapper, ...opts }) };
}
