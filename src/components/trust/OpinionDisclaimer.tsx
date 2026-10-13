import { MessageSquareQuote } from "lucide-react";
import { useTranslations } from "next-intl";

export function OpinionDisclaimer() {
  const t = useTranslations("reviews");
  return (
    <p className="flex items-start gap-2 text-sm text-muted">
      <MessageSquareQuote aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      {t("disclaimer")}
    </p>
  );
}
