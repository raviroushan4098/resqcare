"use client";

import * as T from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;
export function TabsList({ className, ...p }: ComponentProps<typeof T.List>) {
  return <T.List className={cn("inline-flex flex-wrap gap-1 rounded-control border border-border bg-bg p-1", className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "min-h-touch rounded-[10px] px-4 font-medium text-muted data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-sm",
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = T.Content;
