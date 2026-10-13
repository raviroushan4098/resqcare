"use client";

import { Clock, Inbox } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChecklistCard } from "@/components/portal/ChecklistCard";
import { ErrorState } from "@/components/shared/ErrorState";
import { PageHeader } from "@/components/shared/PageHeader";
import { ProfileSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/useApiQuery";
import { usePageTitle } from "@/hooks/usePageTitle";
import type { VerificationState } from "@/lib/schemas";
import { FacilitiesManager, ProfileEditor, RecentAudit, RecordsManager, StaffTable, VerificationCard } from "./sections";

type Dash = {
  hospital: { id: string; name: string; verificationStatus: VerificationState; verifiedAt: string | null };
  verification: { status: string; submittedAt: string | null; reason: string | null };
  checklist: { key: string; done: boolean; href: string }[];
  availability: { updatedAt: string | null; tier: "confirmed" | "reported" | "unknown"; freshnessMinutes: number };
  openRequests: number;
  permissions: { isAdmin: boolean; canUpdateAvailability: boolean; canRespond: boolean };
};

export default function HospitalDashboardPage() {
  const t = useTranslations("portal.dashboard");
  usePageTitle(t("title"));
  const q = useApiQuery<Dash>(["hospital-dashboard"], "/hospital/dashboard", { refetchInterval: 30_000 });
  if (q.isPending) return <ProfileSkeleton />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const d = q.data;
  const p = d.permissions;
  return (
    <div className="space-y-6">
      <PageHeader title={d.hospital.name} description={t("title")} actions={<VerifiedBadge state={d.hospital.verificationStatus} verifiedAt={d.hospital.verifiedAt} />} />
      {d.hospital.verificationStatus !== "approved" ? <StatusBanner variant="info" title={t("unverifiedTitle")} description={t("unverifiedBody")} /> : null}
      {d.availability.tier !== "confirmed" ? (
        <StatusBanner
          variant="stale"
          title={d.availability.updatedAt ? t("staleTitle") : t("neverTitle")}
          description={
            d.availability.updatedAt ? (
              <>{t("staleBody", { minutes: d.availability.freshnessMinutes })} <RelativeTime iso={d.availability.updatedAt} /></>
            ) : t("neverBody")
          }
          action={p.canUpdateAvailability ? <Link href="/hospital/availability" className={buttonVariants({ size: "sm" })}>{t("updateNow")}</Link> : undefined}
        />
      ) : null}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="space-y-2">
          <p className="flex items-center gap-2 font-semibold"><Inbox aria-hidden="true" className="h-5 w-5" />{t("requests")}</p>
          <p className="text-3xl font-bold">{d.openRequests}</p>
          <Link href="/hospital/requests" className="font-medium text-primary underline">{t("openRequests")}</Link>
        </Card>
        <Card className="space-y-2">
          <p className="flex items-center gap-2 font-semibold"><Clock aria-hidden="true" className="h-5 w-5" />{t("availabilityUpdated")}</p>
          <p className="text-lg">{d.availability.updatedAt ? <RelativeTime iso={d.availability.updatedAt} /> : t("never")}</p>
          {p.canUpdateAvailability ? <Link href="/hospital/availability" className="font-medium text-primary underline">{t("updateNow")}</Link> : null}
        </Card>
        <VerificationCard status={d.verification.status} submittedAt={d.verification.submittedAt} reason={d.verification.reason} isAdmin={p.isAdmin} />
      </div>
      <ChecklistCard items={d.checklist} />
      <ProfileEditor canEdit={p.isAdmin} />
      <FacilitiesManager />
      <div className="grid gap-4 lg:grid-cols-2">
        <RecordsManager kind="departments" canManage={p.isAdmin} canToggleDuty={false} />
        <RecordsManager kind="specialists" canManage={p.isAdmin} canToggleDuty={p.canUpdateAvailability} />
      </div>
      {p.isAdmin ? (
        <>
          <StaffTable />
          <RecentAudit />
        </>
      ) : null}
    </div>
  );
}
