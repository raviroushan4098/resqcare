import { BadgeCheck, Ban, Clock, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useTranslations } from "next-intl";
import { RelativeTime } from "@/components/shared/RelativeTime";
import type { VerificationState } from "@/lib/schemas";
import { cn } from "@/lib/utils";

const STYLE: Record<VerificationState, { icon: typeof BadgeCheck; cls: string }> = {
  approved: { icon: BadgeCheck, cls: "border-confirmed text-confirmed bg-tint-confirmed" },
  pending: { icon: Clock, cls: "border-reported text-reported-text bg-tint-reported" },
  unverified: { icon: ShieldQuestion, cls: "border-unknown text-unknown bg-tint-unknown" },
  rejected: { icon: ShieldAlert, cls: "border-emergency text-emergency bg-tint-emergency" },
  suspended: { icon: Ban, cls: "border-emergency text-emergency bg-tint-emergency" },
};

/** Hospital verification state. Unverified visibly says details are not confirmed. */
export function VerifiedBadge({ state, verifiedAt, className }: { state: VerificationState; verifiedAt?: string | null; className?: string }) {
  const t = useTranslations("verification");
  const s = STYLE[state];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium", s.cls, className)}>
      <Icon aria-hidden="true" className="h-4 w-4" />
      <span>{t(state)}</span>
      {state === "approved" && verifiedAt ? (
        <span className="font-normal">
          · <RelativeTime iso={verifiedAt} />
        </span>
      ) : null}
    </span>
  );
}
