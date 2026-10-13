"use client";

import { Activity, BedDouble, Inbox, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageShell } from "@/components/shared/PageShell";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/hospital/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/hospital/availability", key: "availability", icon: BedDouble },
  { href: "/hospital/requests", key: "requests", icon: Inbox },
] as const;

export default function HospitalLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("portal.nav");
  const path = usePathname();
  return (
    <PageShell audience="portal" width="wide">
      <ProtectedRoute roles={["hospital_admin", "hospital_staff"]}>
        <nav aria-label={t("label")} className="mb-6 flex flex-wrap gap-2">
          <span className="mr-2 flex items-center gap-1 font-semibold"><Activity aria-hidden="true" className="h-5 w-5 text-accent-strong" />{t("title")}</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className={cn("flex min-h-touch items-center gap-2 rounded-control px-3 font-medium", path === n.href ? "bg-text text-white" : "hover:bg-surface")}>
              <n.icon aria-hidden="true" className="h-4 w-4" />
              {t(n.key)}
            </Link>
          ))}
        </nav>
        {children}
      </ProtectedRoute>
    </PageShell>
  );
}
