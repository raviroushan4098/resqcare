"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AuditTable } from "@/components/admin/AuditTable";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { useApiErrorMessage } from "@/components/shared/apiErrorMessage";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { VERIFICATION_CHECKLIST, type AuditEntry, type VerificationState, type VerifyDecision } from "@/lib/schemas";

export interface VerificationDetail {
  hospital: { id: string; name: string; address: string; city: string; phones: string[]; registryRef: string | null; verificationStatus: VerificationState; verifiedAt: string | null };
  facilitiesClaimed: { capability: string; confirmed: boolean; lastVerifiedAt: string | null; source: string }[];
  verification: { submittedAt: string; documents: { name: string; contentType: string; url: string }[]; decision: string; reason: string | null } | null;
  auditTrail: AuditEntry[];
}

/** Submitted details, document viewer, checklist, and a decision form (reason required for non-approvals). */
export function VerificationPanel({ detail, onDecide }: { detail: VerificationDetail; onDecide: (d: VerifyDecision) => Promise<unknown> }) {
  const t = useTranslations("admin.verify");
  const cap = useTranslations("capabilities");
  const msg = useApiErrorMessage();
  const [checklist, setChecklist] = useState<Record<(typeof VERIFICATION_CHECKLIST)[number], boolean>>({ registrationCertificate: false, addressMatch: false, phoneVerified: false, facilityEvidence: false });
  const [decision, setDecision] = useState<VerifyDecision["decision"]>("approve");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docIdx, setDocIdx] = useState(0);
  const h = detail.hospital;
  const needsReason = decision !== "approve";
  const reasonOk = !needsReason || reason.trim().length >= 5;
  const doc = detail.verification?.documents[docIdx];

  return (
    <div className="space-y-5">
      <section className="space-y-1">
        <VerifiedBadge state={h.verificationStatus} verifiedAt={h.verifiedAt} />
        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">{t("address")}</dt><dd>{h.address || "—"}, {h.city}</dd>
          <dt className="text-muted">{t("phone")}</dt><dd>{h.phones.join(", ")}</dd>
          <dt className="text-muted">{t("registry")}</dt><dd>{h.registryRef ?? "—"}</dd>
          {detail.verification ? (<><dt className="text-muted">{t("submitted")}</dt><dd><RelativeTime iso={detail.verification.submittedAt} /></dd></>) : null}
        </dl>
      </section>

      <section>
        <h3 className="mb-2">{t("documents")}</h3>
        {detail.verification?.documents.length ? (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              {detail.verification.documents.map((d, i) => (
                <Button key={d.name} size="sm" variant={i === docIdx ? "primary" : "outline"} onClick={() => setDocIdx(i)}>
                  <FileText aria-hidden="true" className="h-4 w-4" />
                  {d.name}
                </Button>
              ))}
            </div>
            {doc ? (
              doc.contentType === "application/pdf" ? (
                <iframe title={doc.name} src={doc.url} className="h-80 w-full rounded-control border border-border" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={doc.url} alt={doc.name} className="max-h-80 w-full rounded-control border border-border object-contain" onError={() => setError(t("docFailed"))} />
              )
            ) : null}
          </>
        ) : (
          <p className="text-muted">{t("noDocuments")}</p>
        )}
      </section>

      <section>
        <h3 className="mb-2">{t("claimed")}</h3>
        <ul className="flex flex-wrap gap-2">
          {detail.facilitiesClaimed.map((f) => (
            <li key={f.capability} className="rounded-full border border-border px-3 py-1 text-sm">
              {cap(f.capability as "icu")} · {f.confirmed ? t("confirmed") : t("claimedOnly")}
            </li>
          ))}
        </ul>
      </section>

      <form
        className="space-y-3 rounded-card border border-border p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!reasonOk) return;
          setBusy(true);
          setError(null);
          try {
            await onDecide({ decision, reason: reason.trim() || undefined, checklist });
            setReason("");
          } catch (err) {
            setError(msg(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset>
          <legend className="font-semibold">{t("checklist")}</legend>
          {VERIFICATION_CHECKLIST.map((k) => (
            <Checkbox key={k} label={t(`check.${k}`)} checked={checklist[k]} onChange={(e) => setChecklist({ ...checklist, [k]: e.target.checked })} />
          ))}
        </fieldset>
        <fieldset>
          <legend className="font-semibold">{t("decision")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["approve", "reject", "request_info", "suspend"] as const).map((d) => (
              <label key={d} className="flex min-h-touch cursor-pointer items-center gap-2 rounded-control border border-border px-3">
                <input type="radio" name="decision" checked={decision === d} onChange={() => setDecision(d)} className="h-5 w-5" />
                {t(`decisions.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t("reason")} required={needsReason} hint={needsReason ? t("reasonRequired") : t("reasonOptional")} error={needsReason && reason.length > 0 && !reasonOk ? t("reasonShort") : undefined}>
          {({ id, describedBy, invalid }) => <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />}
        </Field>
        {error ? <StatusBanner variant="error" title={error} /> : null}
        <Button type="submit" variant={decision === "approve" ? "positive" : "danger"} disabled={!reasonOk} loading={busy}>
          {t(`submit.${decision}`)}
        </Button>
      </form>

      <section>
        <h3 className="mb-2">{t("trail")}</h3>
        <AuditTable items={detail.auditTrail} />
      </section>
    </div>
  );
}
