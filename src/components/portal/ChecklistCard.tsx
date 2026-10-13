"use client";

import { CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";

export function ChecklistCard({ items }: { items: { key: string; done: boolean; href: string }[] }) {
  const t = useTranslations("portal.checklist");
  const done = items.filter((i) => i.done).length;
  return (
    <Card>
      <h2 className="text-lg">{t("title")}</h2>
      <p className="text-sm text-muted">{t("progress", { done, total: items.length })}</p>
      <ul className="mt-3 space-y-1">
        {items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} className="flex min-h-touch items-center gap-2 rounded-control px-2 hover:bg-bg">
              {i.done ? <CheckCircle2 aria-hidden="true" className="h-5 w-5 text-confirmed" /> : <Circle aria-hidden="true" className="h-5 w-5 text-muted" />}
              <span>{t(`items.${i.key}` as "items.address")}</span>
              <span className="sr-only">{i.done ? t("done") : t("todo")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
