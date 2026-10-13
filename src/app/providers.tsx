"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/ui/toast";
import { isApiError } from "@/lib/api";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { TIME_ZONE } from "@/lib/constants";
import { readScenarioFromUrl } from "@/lib/devScenario";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // lib/api retries GETs itself; never retry 4xx here.
        retry: (count, e) => !isApiError(e) && count < 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        networkMode: "always",
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}

export function Providers({ children, locale, messages }: { children: ReactNode; locale: string; messages: AbstractIntlMessages }) {
  const [queryClient] = useState(makeQueryClient);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") readScenarioFromUrl();
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* offline support is best effort */
      });
    }
  }, []);

  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={TIME_ZONE}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <ToastProvider>{children}</ToastProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  );
}
