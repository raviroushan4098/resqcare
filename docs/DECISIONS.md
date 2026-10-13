# Decisions, deviations and contract assumptions

## Deviations from the specs (with reasons)

| Spec | Built | Why |
|---|---|---|
| MSW mock layer selected by `NEXT_PUBLIC_API_MODE` (frontend prompt) | Real backend in the same app, with two stores: seeded `MemoryStore` (no credentials) and `FirestoreStore` | The second spec adds the backend in Next.js route handlers. Running the real handlers on a seeded store exercises the actual rules (gates, idempotency, transactions) instead of re-implementing them in mocks. MSW is kept for client unit tests only. |
| One `route.ts` per endpoint | One catch-all `app/api/[...path]/route.ts` plus a typed route table | Every endpoint runs the same pipeline (auth, policy, rate limit, validation, envelope), and the whole API is testable without Next.js. |
| One repository file per collection | `repositories/collections.ts` (names and types) plus a generic `DocStore` | Keeps the memory and Firestore stores interchangeable with less duplication. |
| Storybook | `/dev/components` gallery (development only) | Lighter, and it shares the real providers. |
| `--primary` #1F6FEB | #1A66D9 | #1F6FEB is 4.4:1 on the page background, below AA for link text. Added tokens: `--reported-text`, `--accent-strong`, `--border-strong`, and tint backgrounds, each checked by `tokens.test.ts`. |
| `matchedBecause: string[]` | Structured reason objects (`{ code, capability, tier }`) | Allows bilingual rendering and guarantees text comes from stored facts, never AI output. |
| AI returns `requiredCapabilities` | AI may only add *preferred* capabilities; required ones always come from the category map | AI can never relax the safety gate. |
| Timestamps as Firestore Timestamps | ISO strings set by the server clock; `expiresAt` stored as a Timestamp for TTL | Same shape on both stores; the server time is still authoritative. |
| Address search / drop pin | Built-in locality list, GPS, city-centre fallback; pin by coordinates in the hospital profile editor | No geocoding key is required for the demo. |

## Backend contract assumptions to confirm

1. **`GET /config/public`** returns `demoMode`, `emergencyNumbers`, `categories`, `radiusOptionsKm`, `defaultRadiusKm`, `maxRadiusKm`, `freshness.{availabilityMinutes,facilityDays}`, `demoCity` and `mapsEnabled`.
2. **Search response**: `{ intent, results, noConfidentMatch, nearest }`. `results[].lat/lng` are included for the map. `matchedBecause`/`unconfirmed` are reason objects (see `ReasonSchema`).
3. **Pagination**: `?cursor=` (an opaque offset string) with `meta.nextCursor`.
4. **409 for availability** includes the latest version in `details[0].issue` (`latest_version_N`); the client refetches `GET /hospital/availability` to show the latest values.
5. **`Retry-After`** comes as an HTTP header (seconds).
6. **One review per 30 days**: `422 RULE_VIOLATION` with `details[0].issue = "duplicate_review"`.
7. **No providers in range**: `422 RULE_VIOLATION` with `details[0].issue = "no_providers_in_range"`; no booking is created.
8. **`canRevealPhone`** is a top-level boolean on the booking view. The driver phone is only sent when it is true (Assigned, En Route, Arrived; viewer is the owner, provider or admin).
9. **Share link**: `POST /bookings/:id/share-link` returns `{ url, expiresAt }` (2 h). `GET /bookings/:id?t=token` returns a limited view with no contact details.
10. **Booking status values** are stored as `EnRoute` and `TimedOut`, displayed as "En Route" and "Timed out".
11. **Phone OTP**: Firebase phone auth on the client. In demo mode the code is `123456`; there is no OTP endpoint.
12. **Extra endpoints added**: `GET /hospital/dashboard`, `PATCH /provider/service-area`, `POST /admin/applications/:id/decision`, `GET /admin/reviews`, `GET /admin/hospitals/:id`, and GET aliases for `/jobs/*` (Vercel Cron).
