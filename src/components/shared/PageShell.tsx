import { HeartPulse } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { EmergencyBar } from "@/components/emergency/EmergencyBar";
import { cn } from "@/lib/utils";
import { AuthMenu } from "./AuthMenu";
import { DevPanel } from "./DevPanel";
import { LanguageSwitch } from "./LanguageSwitch";
import { OfflineBar } from "./OfflineBar";

type ShellProps = {
  children: ReactNode;
  width?: "narrow" | "wide";
  /** Optional slot for the auth menu (filled once auth lands). */
  authSlot?: ReactNode;
} & (
  | {
      /** Public and patient pages always show the EmergencyBar. */
      audience?: "public" | "patient";
      showEmergencyBar?: never;
    }
  | {
      /** Staff portals may hide it, e.g. on a focused full-screen workflow. */
      audience: "portal";
      showEmergencyBar?: boolean;
    }
);

export function PageShell({ children, width = "narrow", authSlot, ...rest }: ShellProps) {
  const t = useTranslations("shell");
  const showBar = rest.audience === "portal" ? rest.showEmergencyBar !== false : true;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-[70] rounded-control bg-primary px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("skipToMain")}
      </a>
      {showBar ? <EmergencyBar /> : null}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between gap-3 px-4 py-2">
          <Link
            href="/"
            aria-label={t("logoLabel")}
            className="flex min-h-touch items-center gap-2 rounded-control text-lg font-bold text-text"
          >
            <HeartPulse aria-hidden="true" className="h-7 w-7 text-accent-strong" />
            <span>ResQCare AI</span>
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitch />
            {authSlot ?? <AuthMenu />}
          </div>
        </div>
      </header>
      <OfflineBar />
      <main
        id="main"
        tabIndex={-1}
        className={cn("mx-auto w-full px-4 py-6 focus:outline-none", width === "narrow" ? "max-w-3xl" : "max-w-screen-xl")}
      >
        {children}
      </main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto max-w-screen-xl space-y-3 px-4 py-6 text-sm text-muted">
          <p>{t("footer.disclaimer")}</p>
          <nav aria-label={t("footer.navLabel")}>
            <ul className="flex flex-wrap gap-x-4">
              <li><Link className="inline-flex min-h-touch items-center underline" href="/privacy">{t("footer.privacy")}</Link></li>
              <li><Link className="inline-flex min-h-touch items-center underline" href="/terms">{t("footer.terms")}</Link></li>
              <li><Link className="inline-flex min-h-touch items-center underline" href="/disclaimer">{t("footer.medicalDisclaimer")}</Link></li>
            </ul>
          </nav>
        </div>
      </footer>
      {process.env.NODE_ENV !== "production" ? <DevPanel /> : null}
    </>
  );
}
