import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

/** Minimal handlers for client-side unit tests (lib/api, components). Server code is tested directly. */
export const server = setupServer(
  http.get("*/api/config/public", () =>
    HttpResponse.json({
      ok: true,
      data: {
        demoMode: true,
        emergencyNumbers: { national: "112", ambulance: "108", ambulanceAlt: "102" },
        categories: ["cardiac", "stroke", "accident", "breathing", "trauma", "other"],
        radiusOptionsKm: [5, 10, 15, 25],
        defaultRadiusKm: 10,
        maxRadiusKm: 25,
        freshness: { availabilityMinutes: 60, facilityDays: 90 },
        demoCity: { name: "Greater Noida", lat: 28.4744, lng: 77.504 },
        mapsEnabled: false,
      },
      meta: { requestId: "mock-1" },
    }),
  ),
);
