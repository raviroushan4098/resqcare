import { Siren } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

/** Prominent "no account needed" route to emergency search on auth pages. */
export function GuestEmergencyLink() {
  const t = useTranslations("auth");
  return (
    <Link href="/emergency" className={buttonVariants({ variant: "danger", size: "lg", block: true })}>
      <Siren aria-hidden="true" className="h-5 w-5" />
      {t("guestEmergency")}
    </Link>
  );
}
