import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { InlineEmergencyNumbers } from "@/components/emergency/InlineEmergencyNumbers";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  primaryAction,
  showEmergencyNumbers = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  primaryAction?: ReactNode;
  showEmergencyNumbers?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface p-6 text-center", className)}>
      <Icon aria-hidden="true" className="h-10 w-10 text-muted" />
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="max-w-prose text-muted">{description}</p> : null}
      {primaryAction}
      {showEmergencyNumbers ? <InlineEmergencyNumbers className="justify-center" /> : null}
    </div>
  );
}
