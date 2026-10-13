"use client";

import { BadgeCheck, Flag, MessageSquareReply } from "lucide-react";
import { useTranslations } from "next-intl";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Card } from "@/components/ui/card";
import type { ReviewView } from "@/lib/schemas";
import { StarRating } from "./StarRating";

/** User text renders as plain text (React escapes it); no HTML is ever injected. */
export function ReviewCard({ review, onReport, showHospital = true }: { review: ReviewView; onReport?: (id: string) => void; showHospital?: boolean }) {
  const t = useTranslations("reviews");
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarRating value={review.rating} size="sm" />
        <span className="text-sm text-muted">
          <RelativeTime iso={review.createdAt} />
        </span>
      </div>
      {showHospital ? <p className="font-semibold">{review.hospitalName}</p> : null}
      <p className="whitespace-pre-line break-words">{review.text}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>{t("by", { name: review.authorName })}</span>
        {review.verifiedVisit ? (
          <span className="inline-flex items-center gap-1 text-confirmed">
            <BadgeCheck aria-hidden="true" className="h-4 w-4" />
            {t("verifiedVisit")}
          </span>
        ) : null}
      </div>
      {review.response ? (
        <div className="rounded-control border-l-4 border-primary bg-bg p-3 text-sm">
          <p className="flex items-center gap-1 font-semibold">
            <MessageSquareReply aria-hidden="true" className="h-4 w-4" />
            {t("hospitalResponse")}
          </p>
          <p className="whitespace-pre-line">{review.response.text}</p>
        </div>
      ) : null}
      {onReport ? (
        <button type="button" onClick={() => onReport(review.id)} className="inline-flex min-h-touch items-center gap-1 text-sm text-muted underline">
          <Flag aria-hidden="true" className="h-4 w-4" />
          {t("report")}
        </button>
      ) : null}
    </Card>
  );
}
