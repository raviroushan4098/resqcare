/** In-process record of the last outcome per integration, for GET /admin/health. */
type Outcome = { ok: boolean; at: string; detail: string | null };
const last = ((globalThis as unknown as { __rqHealth?: Record<string, Outcome> }).__rqHealth ??= {});

export function recordHealth(name: "ai" | "maps" | "notifications" | "database", ok: boolean, detail: string | null = null) {
  last[name] = { ok, at: new Date().toISOString(), detail };
}
export const lastHealth = () => ({ ...last });
