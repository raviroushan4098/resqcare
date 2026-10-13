import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: { href: string; label: string }[];
  actions?: ReactNode;
}) {
  const t = useTranslations("common");
  return (
    <div className="mb-6 space-y-2">
      {breadcrumbs?.length ? (
        <nav aria-label={t("breadcrumb")}>
          <ol className="flex flex-wrap gap-1 text-sm text-muted">
            {breadcrumbs.map((b, i) => (
              <li key={b.href} className="flex items-center gap-1">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                <Link href={b.href} className="underline">
                  {b.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1>{title}</h1>
          {description ? <p className="mt-1 text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
