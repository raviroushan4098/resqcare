"use client";

import { AlertOctagon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { PageShell } from "@/components/shared/PageShell";
import { Button, buttonVariants } from "@/components/ui/button";

/** Route error boundary: retry plus emergency numbers. Raw error text is never shown. */
export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("utility.error");
  return (
    <PageShell>
      <div role="alert" className="flex flex-col items-center gap-4 py-8 text-center">
        <AlertOctagon aria-hidden="true" className="h-12 w-12 text-emergency" />
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={reset}>{t("retry")}</Button>
          <Link href="/hospitals" className={buttonVariants({ variant: "outline" })}>{t("browse")}</Link>
        </div>
        <InlineEmergencyNumbers className="justify-center" />
      </div>
    </PageShell>
  );
}
