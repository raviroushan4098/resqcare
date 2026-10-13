"use client";

import { useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useState } from "react";
import { BookingForm } from "@/components/ambulance/BookingForm";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { PageHeader } from "@/components/shared/PageHeader";
import { PageShell } from "@/components/shared/PageShell";
import { buttonVariants } from "@/components/ui/button";
import { usePageTitle } from "@/hooks/usePageTitle";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { BookingView, HospitalDetail } from "@/lib/schemas";

function AmbulanceView() {
  const t = useTranslations("ambulancePage");
  usePageTitle(t("title"));
  const router = useRouter();
  const params = useSearchParams();
  const hospitalId = params.get("hospital");
  const cfg = usePublicConfig();
  const { status, me } = useAuth();
  const [noProviders, setNoProviders] = useState(false);
  const hospital = useQuery({
    queryKey: ["hospital", hospitalId],
    enabled: !!hospitalId,
    queryFn: async () => (await api.get<HospitalDetail>(`/hospitals/${hospitalId}`, { anonymous: true })).data,
  });
  const signedInPatient = status === "signedIn" && me?.role === "patient";

  return (
    <PageShell audience="patient">
      <DemoBanner />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control border-2 border-emergency bg-tint-emergency p-3">
        <p className="font-semibold text-emergency">{t("call108Notice")}</p>
        <a href="tel:108" className={buttonVariants({ variant: "emergency" })}>
          <Phone aria-hidden="true" className="h-5 w-5" />
          {t("call108")}
        </a>
      </div>
      <PageHeader title={t("title")} description={t("description")} />
      {noProviders ? (
        <section role="alert" className="space-y-3 rounded-card border-2 border-reported bg-tint-reported p-4">
          <h2>{t("noProvidersTitle")}</h2>
          <p>{t("noProvidersBody")}</p>
          <InlineEmergencyNumbers />
          {hospital.data ? (
            <a href={`tel:${hospital.data.phone.replace(/\s/g, "")}`} className={buttonVariants({ variant: "positive" })}>
              <Phone aria-hidden="true" className="h-4 w-4" />
              {t("callHospital", { name: hospital.data.name })}
            </a>
          ) : null}
        </section>
      ) : (
        <BookingForm
          preselected={hospital.data ? { id: hospital.data.id, name: hospital.data.name } : null}
          signedIn={signedInPatient}
          fallbackCenter={cfg.data ? { ...cfg.data.demoCity } : undefined}
          onNoProviders={() => setNoProviders(true)}
          onSubmit={async (body, key) => {
            const res = await api.post<BookingView>("/bookings", body, { idempotencyKey: key });
            router.push(`/bookings/${res.data.id}`);
          }}
        />
      )}
      {status === "signedIn" && me && me.role !== "patient" ? <p className="mt-3 text-sm text-muted">{t("staffNote")}</p> : null}
    </PageShell>
  );
}

export default function AmbulancePage() {
  return (
    <Suspense>
      <AmbulanceView />
    </Suspense>
  );
}
