"use client";

import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

/**
 * Modal dialog. Radix hides the rest of the page from assistive tech while it
 * is open, so every dialog repeats the emergency numbers inside itself.
 */
export function DialogContent({
  title,
  description,
  children,
  side,
  className,
  hideEmergency,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  side?: "right" | "bottom";
  className?: string;
  hideEmergency?: boolean;
}) {
  const t = useTranslations("common");
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-[rgba(18,40,76,0.45)] motion-fade" />
      <D.Content
        className={cn(
          "fixed z-50 flex max-h-[100dvh] flex-col overflow-y-auto bg-surface p-4 shadow-xl focus:outline-none",
          side === "right"
            ? "inset-y-0 right-0 w-full max-w-xl"
            : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-card sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card",
          // Leave the mobile EmergencyBar visible below bottom sheets.
          side !== "right" && "mb-[calc(var(--emergency-bar-h)+env(safe-area-inset-bottom))] sm:mb-0",
          className,
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <div>
            <D.Title className="text-xl font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-1 text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          </div>
          <D.Close className="flex min-h-touch min-w-touch items-center justify-center rounded-control hover:bg-bg" aria-label={t("close")}>
            <X aria-hidden="true" className="h-5 w-5" />
          </D.Close>
        </div>
        <div className="flex-1">{children}</div>
        {hideEmergency ? null : <InlineEmergencyNumbers className="mt-4 border-t border-border pt-3" />}
      </D.Content>
    </D.Portal>
  );
}
