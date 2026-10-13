import { Ambulance, CheckCircle2, ListChecks, PhoneCall, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CATEGORY_ICONS } from "@/components/emergency/categoryIcons";
import { PageShell } from "@/components/shared/PageShell";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { buttonVariants } from "@/components/ui/button";
import { CATEGORIES } from "@/lib/schemas";

export default function HomePage() {
  const t = useTranslations("home");
  const c = useTranslations("categories");
  const conf = useTranslations("confidence");
  return (
    <PageShell width="wide">
      <section aria-labelledby="hero-title" className="space-y-4 py-2">
        <h1 id="hero-title" className="text-[28px] leading-tight sm:text-4xl">{t("title")}</h1>
        <p className="max-w-2xl text-lg text-muted">{t("lead")}</p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/emergency" className={buttonVariants({ size: "lg", className: "sm:min-w-[260px]" })}>
            <Search aria-hidden="true" className="h-5 w-5" />
            {t("findHospital")}
          </Link>
          <Link href="/ambulance" className={buttonVariants({ variant: "secondary", size: "lg" })}>
            <Ambulance aria-hidden="true" className="h-5 w-5" />
            {t("requestAmbulance")}
          </Link>
        </div>
        <p className="text-sm text-muted">{t("noLogin")}</p>
      </section>

      <section aria-labelledby="cat-title" className="mt-8">
        <h2 id="cat-title" className="mb-3">{t("categoriesTitle")}</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            return (
              <li key={cat}>
                <Link href={`/emergency?category=${cat}`} className="flex min-h-[112px] flex-col gap-1 rounded-card border-2 border-border bg-surface p-3 hover:border-primary">
                  <Icon aria-hidden="true" className="h-8 w-8 text-primary" />
                  <span className="text-lg font-semibold leading-tight">{c(`${cat}.title`)}</span>
                  <span className="text-sm text-muted">{c(`${cat}.hint`)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="how-title" className="mt-10">
        <h2 id="how-title" className="mb-3">{t("howTitle")}</h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {([["step1", ListChecks], ["step2", CheckCircle2], ["step3", PhoneCall]] as const).map(([k, Icon], i) => (
            <li key={k} className="rounded-card border border-border bg-surface p-4">
              <p className="flex items-center gap-2 font-semibold">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-text text-white">{i + 1}</span>
                <Icon aria-hidden="true" className="h-5 w-5 text-accent-strong" />
                {t(`${k}.title`)}
              </p>
              <p className="mt-1 text-muted">{t(`${k}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="honest-title" className="mt-10 rounded-card border border-border bg-surface p-4">
        <h2 id="honest-title">{t("honestTitle")}</h2>
        <p className="mt-1 text-muted">{t("honestBody")}</p>
        <dl className="mt-4 grid gap-3 md:grid-cols-3">
          {(["confirmed", "reported", "unknown"] as const).map((tier) => (
            <div key={tier} className="space-y-1">
              <dt><ConfidenceBadge tier={tier} /></dt>
              <dd className="text-sm">{conf(`${tier}.legend`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </PageShell>
  );
}
