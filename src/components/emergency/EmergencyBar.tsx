import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { EMERGENCY_NUMBERS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Always-visible emergency call strip. Plain `tel:` links with no data or
 * client JavaScript, so it works before hydration, offline and on error pages.
 *
 * Mobile: fixed to the bottom of the viewport (body reserves the space).
 * Desktop (md+): sticky strip at the top.
 *
 * z-index sits above dialog overlays, and pointer-events are forced on so
 * the links stay tappable while a modal has disabled pointer events on body.
 */
export function EmergencyBar({ className }: { className?: string }) {
  const t = useTranslations("emergencyBar");

  return (
    <nav
      aria-label={t("regionLabel")}
      data-emergency-bar=""
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-[60] border-t border-border bg-surface",
        "px-2 pt-2 pb-[calc(8px+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(18,40,76,0.08)]",
        "md:sticky md:top-0 md:bottom-auto md:border-b md:border-t-0 md:pb-2 md:shadow-none",
        className,
      )}
    >
      <ul className="mx-auto flex max-w-screen-xl items-stretch gap-2">
        <li className="min-w-0 flex-1 md:flex-none">
          <a
            href={`tel:${EMERGENCY_NUMBERS.national}`}
            aria-label={t("call112Label")}
            className={cn(
              "flex min-h-emergency w-full items-center justify-center gap-2 rounded-control px-4",
              "bg-emergency text-lg font-bold text-white hover:bg-emergency-hover md:min-w-[200px]",
            )}
          >
            <Phone aria-hidden="true" className="h-6 w-6 shrink-0" strokeWidth={2.5} />
            <span className="truncate">{t("call112")}</span>
          </a>
        </li>
        <li>
          <a
            href={`tel:${EMERGENCY_NUMBERS.ambulance}`}
            aria-label={t("call108Label")}
            className={secondaryLink}
          >
            <span className="text-lg font-bold leading-none">{EMERGENCY_NUMBERS.ambulance}</span>
            <span className="text-xs leading-tight">{t("ambulance")}</span>
          </a>
        </li>
        <li>
          <a
            href={`tel:${EMERGENCY_NUMBERS.ambulanceAlt}`}
            aria-label={t("call102Label")}
            className={secondaryLink}
          >
            <span className="text-lg font-bold leading-none">{EMERGENCY_NUMBERS.ambulanceAlt}</span>
            <span className="text-xs leading-tight">{t("ambulance")}</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}

const secondaryLink = cn(
  "flex min-h-emergency min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-control px-3",
  "border-2 border-emergency bg-surface text-emergency hover:bg-tint-emergency",
);
