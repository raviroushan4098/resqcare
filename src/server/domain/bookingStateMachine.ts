import type { BookingStatus, Role } from "@/lib/schemas";

type Actor = Role | "system";

/** Allowed transitions and who may trigger each (Part C.7). */
export const TRANSITIONS: Record<BookingStatus, Partial<Record<BookingStatus, Actor[]>>> = {
  Requested: { Searching: ["system"], Cancelled: ["patient", "system"], Failed: ["system"] },
  Searching: {
    Accepted: ["dispatcher", "system"],
    Rejected: ["dispatcher", "system"],
    TimedOut: ["system"],
    Cancelled: ["patient", "system"],
  },
  Accepted: { Assigned: ["dispatcher", "system"], Cancelled: ["patient", "system"], Failed: ["system", "dispatcher"] },
  Assigned: {
    EnRoute: ["driver", "dispatcher", "system"],
    Cancelled: ["patient", "dispatcher", "system"],
    Failed: ["system", "dispatcher"],
  },
  EnRoute: { Arrived: ["driver", "dispatcher", "system"], Failed: ["driver", "dispatcher", "system"] },
  Arrived: { Completed: ["driver", "dispatcher", "system"] },
  Completed: {},
  Cancelled: {},
  Rejected: {},
  TimedOut: {},
  Failed: {},
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  const allowed = TRANSITIONS[from]?.[to];
  if (!allowed) return false;
  // Super admins may perform any operational transition.
  return allowed.includes(actor) || (actor === "super_admin" && !allowed.every((a) => a === "system"));
}

export const isTerminal = (s: BookingStatus) => Object.keys(TRANSITIONS[s]).length === 0;

/** Patients can cancel until the ambulance has arrived. */
export const isCancellable = (s: BookingStatus) => Boolean(TRANSITIONS[s].Cancelled);

/** The single next step a driver may take. */
export function nextDriverStep(s: BookingStatus): "EnRoute" | "Arrived" | "Completed" | null {
  return s === "Assigned" ? "EnRoute" : s === "EnRoute" ? "Arrived" : s === "Arrived" ? "Completed" : null;
}
