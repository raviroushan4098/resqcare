"use client";

import { LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/AuthProvider";
import { HOME_FOR_ROLE } from "@/lib/roles";

export function AuthMenu() {
  const t = useTranslations("shell");
  const tr = useTranslations("roles");
  const { status, me, signOut } = useAuth();
  const router = useRouter();
  if (status !== "signedIn" || !me) {
    return (
      <Link href="/login" className="hidden min-h-touch items-center rounded-control px-3 font-medium text-primary hover:underline sm:flex">
        {t("signIn")}
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <Link
        href={HOME_FOR_ROLE[me.role]}
        className="hidden min-h-touch items-center gap-2 rounded-control px-2 text-sm hover:bg-bg sm:flex"
        title={me.displayName}
      >
        <UserRound aria-hidden="true" className="h-5 w-5" />
        <span className="max-w-[160px] truncate">{tr(me.role)}</span>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("signOut")}
        onClick={async () => {
          await signOut();
          router.push("/");
        }}
      >
        <LogOut aria-hidden="true" className="h-5 w-5" />
      </Button>
    </div>
  );
}
