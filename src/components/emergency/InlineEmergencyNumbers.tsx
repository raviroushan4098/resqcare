import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { EMERGENCY_NUMBERS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** Compact emergency links for places the EmergencyBar may be hidden from assistive tech (dialogs, error screens). */
export function InlineEmergencyNumbers({ className }: { className?: string }) {
  const t = useTranslations("emergencyBar");
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm font-medium text-muted">{t("inlineLabel")}</span>
      <a href={`tel:${EMERGENCY_NUMBERS.national}`} aria-label={t("call112Label")} className="inline-flex min-h-touch items-center gap-1 rounded-control bg-emergency px-3 font-bold text-white">
        <Phone aria-hidden="true" className="h-4 w-4" /> 112
      </a>
      <a href={`tel:${EMERGENCY_NUMBERS.ambulance}`} aria-label={t("call108Label")} className="inline-flex min-h-touch items-center rounded-control border-2 border-emergency px-3 font-bold text-emergency">
        108
      </a>
      <a href={`tel:${EMERGENCY_NUMBERS.ambulanceAlt}`} aria-label={t("call102Label")} className="inline-flex min-h-touch items-center rounded-control border-2 border-emergency px-3 font-bold text-emergency">
        102
      </a>
    </div>
  );
}
