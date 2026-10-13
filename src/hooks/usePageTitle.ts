"use client";

import { useEffect } from "react";

/** Sets the document title for client-rendered pages ("Title · ResQCare AI"). */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · ResQCare AI`;
  }, [title]);
}
