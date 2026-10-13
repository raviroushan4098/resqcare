"use client";

import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";
import { api, isApiError } from "@/lib/api";

/**
 * GET wrapper for signed-in areas: a 401 from the API sends the user to
 * /login?next= (the UI is never the security boundary).
 */
export function useApiQuery<T>(key: unknown[], path: string, opts: Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> & { query?: Record<string, string | number | boolean | undefined> } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const { query, ...rest } = opts;
  const q = useQuery<T>({ queryKey: key, queryFn: async () => (await api.get<T>(path, { query })).data, ...rest });
  useEffect(() => {
    if (isApiError(q.error) && q.error.code === "UNAUTHENTICATED") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [q.error, router, pathname]);
  return q;
}
