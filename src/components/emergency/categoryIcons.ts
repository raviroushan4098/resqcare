import { Activity, Brain, Car, HeartPulse, ShieldPlus, Wind, type LucideIcon } from "lucide-react";
import type { Category } from "@/lib/schemas";

/** Shared by server and client components (kept out of "use client" files). */
export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  cardiac: HeartPulse,
  stroke: Brain,
  accident: Car,
  breathing: Wind,
  trauma: ShieldPlus,
  other: Activity,
};
