import { WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { PageShell } from "@/components/shared/PageShell";

/** Served by the service worker when a page cannot be fetched. Static emergency instructions only. */
export default function OfflinePage() {
  const t = useTranslations("utility.offline");
  return (
    <PageShell>
      <div className="space-y-4">
        <h1 className="flex items-center gap-2"><WifiOff aria-hidden="true" className="h-7 w-7" />{t("title")}</h1>
        <p className="text-lg">{t("body")}</p>
        <InlineEmergencyNumbers />
        <ol className="list-decimal space-y-2 pl-5">
          <li>{t("step1")}</li>
          <li>{t("step2")}</li>
          <li>{t("step3")}</li>
          <li>{t("step4")}</li>
        </ol>
        <p className="text-sm text-muted">{t("cached")}</p>
      </div>
    </PageShell>
  );
}
