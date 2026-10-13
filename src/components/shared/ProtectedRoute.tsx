"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { Role } from "@/lib/schemas";
import { ProfileSkeleton } from "./Skeletons";

export function PermissionDenied() {
  const t = useTranslations("permission");
  const { signOut } = useAuth();
  const router = useRouter();
  const path = usePathname();
  return (
    <div role="alert" className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-card border border-border bg-surface p-6 text-center">
      <Lock aria-hidden="true" className="h-10 w-10 text-muted" />
      <h1 className="text-xl">{t("title")}</h1>
      <p>{t("body")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="primary"
          onClick={async () => {
            await signOut();
            router.push(`/login?next=${encodeURIComponent(path)}`);
          }}
        >
          {t("switchAccount")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("home")}</Link>
        </Button>
      </div>
      <InlineEmergencyNumbers className="justify-center" />
    </div>
  );
}

/**
 * Client-side gate for role areas. Unauthenticated users go to /login?next=;
 * wrong roles see PermissionDenied. This is convenience only: the API checks
 * every request and the pages handle 401/403 from it too.
 */
export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { status, me } = useAuth();
  const router = useRouter();
  const path = usePathname();
  const t = useTranslations("common");

  useEffect(() => {
    if (status === "signedOut") router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [status, router, path]);

  if (status === "loading" || status === "signedOut") {
    return (
      <div role="status" aria-live="polite">
        <span className="sr-only">{t("loading")}</span>
        <ProfileSkeleton />
      </div>
    );
  }
  if (!me || !roles.includes(me.role)) return <PermissionDenied />;
  return <>{children}</>;
}
