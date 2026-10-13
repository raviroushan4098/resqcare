import { getTranslations } from "next-intl/server";
import { LegalPage } from "@/components/shared/LegalPage";

export async function generateMetadata() {
  const t = await getTranslations("legal.privacy");
  return { title: t("title") };
}

export default function Page() {
  return <LegalPage section="privacy" />;
}
