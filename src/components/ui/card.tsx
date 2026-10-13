import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(18,40,76,0.06)]", className)} {...props} />;
}
