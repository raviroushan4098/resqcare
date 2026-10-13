import "server-only";
import { CACHE_TTL } from "../../config/constants";
import { recordHealth } from "../health";
import { routeEstimate } from "./google";
import { straightLineEstimate } from "./haversine";

type Est = { distanceKm: number; etaMinutes: number; source: "routes" | "straight_line" };
const cache = ((globalThis as unknown as { __rqRoutes?: Map<string, { at: number; v: Est }> }).__rqRoutes ??= new Map());
const k = (o: { lat: number; lng: number }, d: { lat: number; lng: number }) =>
  `${o.lat.toFixed(3)},${o.lng.toFixed(3)}>${d.lat.toFixed(3)},${d.lng.toFixed(3)}`;

/**
 * Travel estimates for the top destinations via Routes API (cached 5 min by
 * rounded origin/destination). Any failure falls back to straight-line
 * estimates and reports degraded=true so the UI says "Distances approximate".
 */
export async function travelEstimates(
  origin: { lat: number; lng: number },
  dests: { id: string; lat: number; lng: number }[],
  opts: { routedTop?: number; forceFail?: boolean; route?: typeof routeEstimate } = {},
): Promise<{ estimates: Map<string, Est>; degraded: boolean }> {
  const estimates = new Map<string, Est>();
  let degraded = Boolean(opts.forceFail);
  const top = opts.forceFail ? [] : dests.slice(0, opts.routedTop ?? 5);
  await Promise.all(
    top.map(async (d) => {
      const key = k(origin, d);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL.routesMs) return void estimates.set(d.id, hit.v);
      try {
        const v: Est = { ...(await (opts.route ?? routeEstimate)(origin, d)), source: "routes" };
        cache.set(key, { at: Date.now(), v });
        estimates.set(d.id, v);
        recordHealth("maps", true);
      } catch (e) {
        degraded = true;
        recordHealth("maps", false, (e as Error).message === "not_configured" ? "GOOGLE_ROUTES_API_KEY not set" : "fallback used");
      }
    }),
  );
  for (const d of dests) if (!estimates.has(d.id)) estimates.set(d.id, { ...straightLineEstimate(origin, d), source: "straight_line" });
  // Results beyond the routed top-N always use straight-line, which is expected, not degraded.
  return { estimates, degraded };
}
