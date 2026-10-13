import { AlertOctagon, AlertTriangle, Clock, Info, MapPinOff, Sparkles, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BannerVariant = "offline" | "stale" | "degraded-ai" | "degraded-maps" | "demo" | "info" | "error";

const STYLE: Record<BannerVariant, { icon: LucideIcon; cls: string; iconCls: string }> = {
  offline: { icon: WifiOff, cls: "border-reported bg-tint-reported", iconCls: "text-reported-text" },
  stale: { icon: Clock, cls: "border-reported bg-tint-reported", iconCls: "text-reported-text" },
  "degraded-ai": { icon: Sparkles, cls: "border-border-strong bg-surface", iconCls: "text-muted" },
  "degraded-maps": { icon: MapPinOff, cls: "border-border-strong bg-surface", iconCls: "text-muted" },
  demo: { icon: AlertTriangle, cls: "border-2 border-emergency bg-tint-emergency", iconCls: "text-emergency" },
  info: { icon: Info, cls: "border-primary bg-tint-primary", iconCls: "text-primary" },
  error: { icon: AlertOctagon, cls: "border-emergency bg-tint-emergency", iconCls: "text-emergency" },
};

/** Notice with icon + text (never colour alone). Errors use role="alert", everything else role="status". */
export function StatusBanner({
  variant,
  title,
  description,
  action,
  className,
}: {
  variant: BannerVariant;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const s = STYLE[variant];
  const Icon = s.icon;
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-control border p-3", s.cls, className)}>
      <Icon aria-hidden="true" className={cn("mt-0.5 h-5 w-5 shrink-0", s.iconCls)} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {description ? <p className="text-sm text-text">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
