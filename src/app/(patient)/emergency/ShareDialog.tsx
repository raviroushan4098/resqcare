"use client";

import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { PickedLocation } from "@/components/emergency/LocationGate";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { Category, SearchResult } from "@/lib/schemas";

/** Explicit consent before POST /emergency/requests. Only the category, rounded location and ETA are required. */
export function ShareDialog({ target, category, location, onClose }: { target: SearchResult; category: Category; location: PickedLocation; onClose: () => void }) {
  const t = useTranslations("share");
  const msg = useApiErrorMessage();
  const [consent, setConsent] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const send = useMutation({
    mutationFn: () =>
      api.post("/emergency/requests", {
        hospitalId: target.hospitalId,
        category,
        lat: location.lat,
        lng: location.lng,
        etaMinutes: target.etaMinutes,
        consent: { location: true, shareDetails: true },
        contact: name || phone ? { name: name || undefined, phone: phone || undefined } : undefined,
      }),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t("title", { name: target.name })} description={t("description")}>
        {send.isSuccess ? (
          <div className="space-y-3">
            <StatusBanner variant="info" title={t("sent")} description={t("sentBody")} />
            <Button block onClick={onClose}>{t("done")}</Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (consent) send.mutate();
            }}
          >
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>{t("shares.category")}</li>
              <li>{t("shares.location")}</li>
              <li>{t("shares.eta")}</li>
            </ul>
            <Field label={t("name")} hint={t("optional")}>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />}
            </Field>
            <Field label={t("phone")} hint={t("optional")}>
              {({ id, describedBy }) => <Input id={id} type="tel" aria-describedby={describedBy} value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />}
            </Field>
            <Checkbox label={t("consent")} checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <p className="text-sm text-muted">{t("retention")}</p>
            {send.isError ? <StatusBanner variant="error" title={msg(send.error)} /> : null}
            <Button type="submit" block disabled={!consent} loading={send.isPending}>{t("send")}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
