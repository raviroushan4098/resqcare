"use client";

import * as T from "@radix-ui/react-tooltip";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

/** Supplementary only: everything in a tooltip is also available as text or an accessible name. */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <T.Root delayDuration={200}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content sideOffset={6} className="z-[55] max-w-xs rounded-control bg-text px-3 py-2 text-sm text-white shadow-lg">
          {content}
          <T.Arrow className="fill-[var(--text)]" />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
