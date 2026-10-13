import type { Capability, Category } from "@/lib/schemas";

/**
 * Capabilities a hospital MUST have (Confirmed or Reported) to be shown as a
 * match for a category. This is the safety gate: AI can never relax it.
 */
export const REQUIRED_CAPABILITIES: Record<Category, Capability[]> = {
  cardiac: ["cath_lab", "icu"],
  stroke: ["ct_scan", "stroke_unit"],
  accident: ["trauma_center", "ct_scan"],
  breathing: ["ventilator", "icu"],
  trauma: ["trauma_center", "blood_bank"],
  other: ["emergency_24x7"],
};

/** Specialties that count as "specialist on duty" for a category. */
export const CATEGORY_SPECIALTIES: Record<Category, string[]> = {
  cardiac: ["Cardiology"],
  stroke: ["Neurology"],
  accident: ["Orthopaedics", "General Surgery"],
  breathing: ["Pulmonology"],
  trauma: ["General Surgery", "Orthopaedics"],
  other: [],
};

/** Keyword hints for rule-based preferred capabilities when AI is unavailable. */
export const KEYWORD_CAPABILITIES: [RegExp, Capability][] = [
  [/burn|जल/i, "burn_unit"],
  [/baby|newborn|infant|नवजात|शिशु/i, "nicu"],
  [/bleed|blood|खून/i, "blood_bank"],
  [/kidney|dialysis|किडनी/i, "dialysis"],
  [/head|seizure|सिर|दौरा/i, "ct_scan"],
];
