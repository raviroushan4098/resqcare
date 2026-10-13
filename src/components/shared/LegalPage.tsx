import { useTranslations } from "next-intl";
import { PageShell } from "./PageShell";

/** Plain-language legal and disclaimer pages; paragraphs come from messages (legal.<section>.p1..p5). */
export function LegalPage({ section }: { section: "privacy" | "terms" | "disclaimer" }) {
  const t = useTranslations(`legal.${section}`);
  const keys = ["p1", "p2", "p3", "p4", "p5"] as const;
  return (
    <PageShell>
      <article className="space-y-4">
        <h1>{t("title")}</h1>
        <p className="text-sm text-muted">{t("updated")}</p>
        {keys.map((k) => (
          <p key={k}>{t(k)}</p>
        ))}
      </article>
    </PageShell>
  );
}
