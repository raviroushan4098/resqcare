"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PublicConfigSchema, type PublicConfig } from "@/lib/schemas";

export function usePublicConfig() {
  return useQuery({
    queryKey: ["config", "public"],
    queryFn: async () => (await api.get<PublicConfig>("/config/public", { schema: PublicConfigSchema, anonymous: true })).data,
    staleTime: 60_000,
  });
}
