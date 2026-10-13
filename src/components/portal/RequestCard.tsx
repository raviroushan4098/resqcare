"use client";

import { Check, Phone, UserCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CATEGORY_ICONS } from "@/components/emergency/categoryIcons";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/field";
import { useAppLocale } from "@/hooks/useAppLocale";
import { formatMinutes } from "@/lib/format";
import type { Category } from "@/lib/schemas";
import { cn } from "@/lib/utils";

export interface IncomingRequest {
  id: string;
  category: Category;
  etaMinutes: number | null;
  status: "new" | "accepted" | "declined" | "arrived" | "expired";
  createdAt: string;
  declineReason: string | null;
  handledByName: string | null;
  hasContact: boolean;
  contact: { name: string | null; phone: string | null; phoneMasked: string } | null;
}

/** Accept / Decline (reason required) / Mark arrived. Contact only appears with permission. */
export function RequestCard({
  req,
  canRespond,
  onRespond,
  isNew,
}: {
  req: IncomingRequest;
  canRespond: boolean;
  onRespond: (action: "accept" | "decline" | "arrived", reason?: string) => Promise<unknown>;
  isNew?: boolean;
}) {
  const t = useTranslations("portal.requests");
  const cat = useTranslations("categories");
  const locale = useAppLocale();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const Icon = CATEGORY_ICONS[req.category];
  const act = async (a: "accept" | "decline" | "arrived", r?: string) => {
    setBusy(true);
    try {
      await onRespond(a, r);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={cn("space-y-2", isNew && "border-2 border-primary")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="flex items-center gap-2">
          <Icon aria-hidden="true" className="h-6 w-6" />
          {cat(`${req.category}.title`)}
          {isNew ? <span className="rounded-full bg-primary px-2 text-xs text-white">{t("new")}</span> : null}
        </h3>
        <span className="text-sm text-muted">{t("age")} <RelativeTime iso={req.createdAt} /></span>
      </div>
      <p>{req.etaMinutes !== null ? t("eta", { eta: formatMinutes(req.etaMinutes, locale) }) : t("etaUnknown")}</p>
      <p className="text-sm">
        <span className="font-semibold">{t("contact")}: </span>
        {!req.hasContact ? t("noContact") : req.contact ? (
          <>
            {req.contact.name ?? ""} {req.contact.phone ? <a className="font-medium text-primary underline" href={`tel:${req.contact.phone}`}><Phone aria-hidden="true" className="mr-1 inline h-4 w-4" />{req.contact.phone}</a> : null}
          </>
        ) : t("contactHidden")}
      </p>
      <p className="text-sm font-medium">{t(`status.${req.status}`)}{req.handledByName ? ` · ${t("by", { name: req.handledByName })}` : ""}</p>
      {req.declineReason ? <p className="text-sm text-muted">{t("reason", { reason: req.declineReason })}</p> : null}
      {canRespond ? (
        <div className="flex flex-wrap gap-2">
          {req.status === "new" ? (
            <>
              <Button variant="positive" size="lg" loading={busy} onClick={() => void act("accept")}>
                <Check aria-hidden="true" className="h-5 w-5" />
                {t("accept")}
              </Button>
              <Button variant="danger" size="lg" disabled={busy} onClick={() => setDeclineOpen(true)}>
                <X aria-hidden="true" className="h-5 w-5" />
                {t("decline")}
              </Button>
            </>
          ) : null}
          {req.status === "accepted" ? (
            <Button variant="secondary" size="lg" loading={busy} onClick={() => void act("arrived")}>
              <UserCheck aria-hidden="true" className="h-5 w-5" />
              {t("arrived")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent title={t("declineTitle")} description={t("declineBody")}>
          <form
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (reason.trim().length < 3) return;
              await act("decline", reason.trim());
              setDeclineOpen(false);
            }}
          >
            <Field label={t("reasonLabel")} required error={reason.length > 0 && reason.trim().length < 3 ? t("reasonShort") : undefined}>
              {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <Button type="submit" variant="danger" block disabled={reason.trim().length < 3} loading={busy}>{t("confirmDecline")}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
