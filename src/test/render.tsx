import { render, type RenderOptions } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import type { Locale } from "@/lib/constants";

const MESSAGES = { en, hi };

export function renderWithIntl(ui: ReactElement, { locale = "en", ...opts }: RenderOptions & { locale?: Locale } = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Kolkata">
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(ui, { wrapper: Wrapper, ...opts });
}
