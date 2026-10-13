# Test results

Recorded on 2026-10-13 on macOS, Node v20.20.2, from actual command output.

## pnpm lint
```
✔ No ESLint warnings or errors
```

## pnpm typecheck
```
exit 0
```
(no output = no type errors)

## pnpm test (Vitest)
```
 ✓ src/server/__tests__/domain.test.ts (13 tests) 13ms
 ✓ src/styles/tokens.test.ts (22 tests) 12ms
 ✓ src/messages/messages.test.ts (3 tests) 53ms
 ✓ src/lib/api.test.ts (11 tests) 74ms
 ✓ src/components/emergency/EmergencyBar.test.tsx (5 tests) 115ms
 ✓ src/server/__tests__/api.integration.test.ts (30 tests) 436ms
 ✓ src/components/__tests__/components.test.tsx (28 tests) 620ms
 Test Files  7 passed (7)
      Tests  112 passed (112)
```

## pnpm test:rules (Firestore emulator: security rules + API flows on FirestoreStore)
```
 ✓ tests/rules/firestore-store.rules.test.ts (5 tests)
 ✓ tests/rules/firestore.rules.test.ts (6 tests)
 Test Files  2 passed (2)
      Tests  11 passed (11)
```

## pnpm test:e2e (Playwright, 360 px, axe: zero serious/critical violations required)
```
  ✓  1 [mobile-360] › flows.spec.ts:6:5 › guest ambulance request: one booking on double tap, progresses to Completed (33.6s)
  ✓  2 [mobile-360] › flows.spec.ts:33:5 › stranger cannot open someone else's booking (3.0s)
  ✓  3 [mobile-360] › flows.spec.ts:48:5 › hospital staff updates availability and the public page shows it as Confirmed (4.2s)
  ✓  4 [mobile-360] › flows.spec.ts:65:5 › admin approves a pending hospital with the checklist (3.8s)
  ✓  5 [mobile-360] › flows.spec.ts:79:5 › admin cannot save weights that do not sum to 1.00 (2.1s)
  ✓  6 [mobile-360] › flows.spec.ts:90:5 › dispatcher and driver run a manual trip (3.9s)
  ✓  7 [mobile-360] › public.spec.ts:4:5 › home: primary action visible without scrolling at 360px, emergency bar present (917ms)
  ✓  8 [mobile-360] › public.spec.ts:13:5 › emergency search: manual location, results with tiers and estimates, then hospital detail (3.0s)
  ✓  9 [mobile-360] › public.spec.ts:33:5 › AI down: still returns results with the degraded notice (705ms)
  ✓  10 [mobile-360] › public.spec.ts:43:5 › no confident match: nearest hospitals and emergency numbers (640ms)
  ✓  11 [mobile-360] › public.spec.ts:51:5 › offline: banner shows and emergency numbers still work (1.2s)
  ✓  12 [mobile-360] › public.spec.ts:58:5 › Hindi switch works without a full reload (948ms)
  ✓  13 [mobile-360] › public.spec.ts:69:5 › hospital browse works without location and limits compare to 3 (1.8s)
  13 passed (1.1m)
```

## pnpm build
Production build compiled; 25 routes. The client bundle was scanned for `FIREBASE_PRIVATE_KEY`, `GEMINI_API_KEY`, `GOOGLE_ROUTES_API_KEY`, `CRON_SECRET`, `RATE_LIMIT_SALT`, `firebase-admin` and `BEGIN PRIVATE KEY`: 0 matches.

## Not run
- Lighthouse (accessibility score target 90+): not run in this environment. axe runs in both component and e2e tests instead.
- p95 search latency on a real Firestore project: only measured on the in-memory store (e2e asserts first results render in under 5 s on a dev server; dev-mode compile time dominates).
