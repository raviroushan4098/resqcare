import { SearchX } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { PageShell } from "@/components/shared/PageShell";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  const t = useTranslations("utility.notFound");
  return (
    <PageShell>
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <SearchX aria-hidden="true" className="h-12 w-12 text-muted" />
        <h1>{t("title")}</h1>
        <p>{t("body")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/" className={buttonVariants({})}>{t("home")}</Link>
          <Link href="/hospitals" className={buttonVariants({ variant: "outline" })}>{t("browse")}</Link>
        </div>
        <InlineEmergencyNumbers className="justify-center" />
      </div>
    </PageShell>
  );
}
