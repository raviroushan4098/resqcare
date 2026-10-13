"use client";

import { BarChart3, Building2, LayoutDashboard, Truck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { PageShell } from "@/components/shared/PageShell";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin/dashboard", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/hospitals", key: "hospitals", icon: Building2 },
  { href: "/admin/providers", key: "providers", icon: Truck },
  { href: "/admin/analytics", key: "analytics", icon: BarChart3 },
] as const;

export default function AdminLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.nav");
  const path = usePathname();
  return (
    <PageShell audience="portal" width="wide">
      <ProtectedRoute roles={["super_admin"]}>
        <nav aria-label={t("label")} className="mb-6 flex flex-wrap gap-2">
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
