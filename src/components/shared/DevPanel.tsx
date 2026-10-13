"use client";

import { FlaskConical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Select } from "@/components/ui/field";
import { useAuth } from "@/lib/auth/AuthProvider";
import { getScenario, SCENARIOS, setScenario, type Scenario } from "@/lib/devScenario";
import { DEMO_ACCOUNTS, HOME_FOR_ROLE } from "@/lib/roles";

/** Development-only panel: scenario switch and role switcher (demo auth). */
export function DevPanel() {
  const t = useTranslations("dev");
  const tr = useTranslations("roles");
  const { mode, me, signInDemo, signOut } = useAuth();
  const router = useRouter();
  const [scenario, setLocal] = useState<Scenario>("normal");
  useEffect(() => setLocal(getScenario()), []);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="fixed left-2 bottom-[calc(var(--emergency-bar-h)+8px)] z-[45] flex min-h-touch items-center gap-1 rounded-full border border-border-strong bg-surface px-3 text-sm shadow md:bottom-3"
        >
          <FlaskConical aria-hidden="true" className="h-4 w-4" />
          {t("open")}
          {scenario !== "normal" ? <span className="rounded-full bg-reported px-2 text-xs text-white">{scenario}</span> : null}
        </button>
      </DialogTrigger>
      <DialogContent title={t("title")} description={t("description")} hideEmergency>
        <div className="space-y-5">
          <div className="space-y-1">
            <label htmlFor="dev-scenario" className="font-medium">{t("scenario")}</label>
            <Select
              id="dev-scenario"
              value={scenario}
              onChange={(e) => {
                const s = e.target.value as Scenario;
                setScenario(s);
                setLocal(s);
                router.refresh();
              }}
            >
              {SCENARIOS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>
          {mode === "demo" ? (
            <div className="space-y-2">
              <p className="font-medium">{t("role")}</p>
              <p className="text-sm text-muted">{me ? t("signedInAs", { role: tr(me.role) }) : t("signedOut")}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <Button
                    key={a.uid}
                    variant={me?.uid === a.uid ? "primary" : "outline"}
                    size="sm"
                    onClick={async () => {
                      await signInDemo(a.uid);
                      router.push(HOME_FOR_ROLE[a.role]);
                    }}
                  >
                    {tr(a.role)}
                  </Button>
                ))}
              </div>
              {me ? <Button variant="ghost" size="sm" onClick={() => void signOut()}>{t("signOut")}</Button> : null}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
