"use client";

import { useTranslations } from "next-intl";
import { RelativeTime } from "@/components/shared/RelativeTime";
import type { AuditEntry } from "@/lib/schemas";

/** Actor, action, resource, time; each row expands to the before/after values. */
export function AuditTable({ items }: { items: AuditEntry[] }) {
  const t = useTranslations("audit");
  const tr = useTranslations("roles");
  if (!items.length) return <p className="text-muted">{t("empty")}</p>;
  return (
    <ul className="divide-y divide-border rounded-card border border-border bg-surface">
      {items.map((e) => (
        <li key={e.id}>
          <details className="group p-3">
            <summary className="flex min-h-touch cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-sm font-semibold">{e.action}</span>
              <span className="text-sm">{e.resourceType}/{e.resourceId}</span>
              <span className="text-sm text-muted">{e.actorRole === "system" ? t("system") : tr(e.actorRole as "patient")}</span>
              <span className="ml-auto text-sm text-muted"><RelativeTime iso={e.createdAt} /></span>
            </summary>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>
                <p className="text-sm font-semibold">{t("before")}</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-xs">{JSON.stringify(e.before, null, 2)}</pre>
              </div>
              <div>
                <p className="text-sm font-semibold">{t("after")}</p>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg p-2 text-xs">{JSON.stringify(e.after, null, 2)}</pre>
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
