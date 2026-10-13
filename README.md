# ResQCare AI

Mobile-first emergency hospital discovery and ambulance coordination. Next.js 14 App Router (frontend **and** backend route handlers), Firebase Auth + Firestore, English and Hindi.

> **Demo build.** All hospitals, providers and people are fictional (names end in "(fictional)"), phone numbers use the non-dialable `+91 00000` range, and ambulance dispatch runs in labelled **DEMO MODE**. The emergency bar dials the real 112 / 108 / 102.

---

## Quick start (no credentials needed)

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open http://localhost:3000. With the defaults (`DATA_BACKEND=memory`, `AUTH_MODE=demo`) the app runs fully on its own:

- the backend uses a **seeded in-memory store**: 40 hospitals, providers, vehicles, reviews and 30 days of analytics history. It resets on server restart.
- sign-in is a **role switcher**: on `/login`, or in the **Dev** button bottom-left, choose Patient, Hospital admin, Hospital staff, Dispatcher, Driver or Super admin.
- the guest OTP code is **`123456`**; no SMS is sent.
- maps fall back to lists, AI matching falls back to rule-based matching, and routing falls back to straight-line estimates. Each fallback is honestly flagged in the UI.

Node 20+ and pnpm 10+ are required.

## Using Firebase

1. **Create a project** at https://console.firebase.google.com.
2. **Authentication > Sign-in method:** enable Email/Password, Google and Phone. Add your domain under *Authorized domains*.
3. **Firestore Database:** create it in production mode, in a region near your users (for example `asia-south1`).
4. **Storage:** create the default bucket. It holds verification documents.
5. **Web app config (public):** Project settings > General > *Your apps* > add a Web app. Copy the values into the `NEXT_PUBLIC_FIREBASE_*` variables.
6. **Admin credentials (secret):** Project settings > Service accounts > *Generate new private key*. Copy `project_id`, `client_email` and `private_key` into `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`. Keep the quotes and the `\n` sequences. Never commit this file.
7. Set `DATA_BACKEND=firestore`, `AUTH_MODE=firebase` and `NEXT_PUBLIC_AUTH_MODE=firebase`.
8. **Deploy rules, indexes and TTL policies:**
   ```bash
   npx firebase-tools login
   ```
   ```bash
   npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage --project your-project-id
   ```
   `firestore.indexes.json` also declares TTL on `expiresAt` for `emergencyRequests`, `emergencyRequestContacts`, `locations`, `searchLogs`, `idempotencyKeys`, `rateLimits`, `notifications` and availability `history`.
9. **Seed the fictional demo data and one account per role:**
   ```bash
   SEED_CONFIRM=yes AUTH_MODE=firebase pnpm seed
   ```
   Demo accounts are `patient@`, `hospital-admin@`, `hospital-staff@`, `dispatcher@`, `driver@` and `admin@demo.resqcare.test`. The password is `SEED_PASSWORD` (default `Demo-Pass-2026!`). Use them only on a demo project.

### Local Firebase emulators

```bash
npx firebase-tools emulators:start --project demo-resqcare
```
```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_PROJECT_ID=demo-resqcare pnpm seed
```
Then run the app with `DATA_BACKEND=firestore AUTH_MODE=firebase NEXT_PUBLIC_AUTH_MODE=firebase NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` plus the two emulator host variables.

## Environment variables

Every variable is documented in [.env.example](.env.example). In summary:

| Variable | Where | Purpose |
|---|---|---|
| `DATA_BACKEND` | server | `memory` (default) or `firestore` |
| `AUTH_MODE` / `NEXT_PUBLIC_AUTH_MODE` | server / client | `demo` (role switcher) or `firebase`. Demo auth is refused when `NODE_ENV=production` |
| `NEXT_PUBLIC_FIREBASE_*` | client | Firebase web config (public by design) |
| `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_STORAGE_BUCKET` | server only | Admin SDK |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | client | Maps JavaScript API (restrict by referrer) |
| `GOOGLE_ROUTES_API_KEY` | server only | Routes API travel times |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | server only | Intent extraction (adds preferences only) |
| `CRON_SECRET` | server only | Bearer secret for `/api/jobs/*` |
| `RATE_LIMIT_SALT` | server only | Hashes IPs for rate limits and audit (required in production) |
| `DEMO_MODE_DEFAULT` | server | Initial demo flag (admins can change it) |
| `DEV_SCENARIOS` | server | Enables the scenario switch outside production |

The server validates the environment with Zod at first use and lists every problem it finds (`src/server/config/env.ts`).

## Dev scenarios

Add `?scenario=<name>` to any URL, or use the **Dev** panel. It sets the `rq-scenario` cookie, which the server reads only when `DEV_SCENARIOS=true` and not in production.

| Scenario | Effect |
|---|---|
| `normal` | clear the scenario |
| `ai-down` | AI fails; rule-based matching, "Smart matching unavailable" notice |
| `maps-down` | routing fails; straight-line estimates, "Distances are approximate" |
| `no-match` | no hospital passes the capability gate; nearest hospitals to call |
| `slow` | 3 s delay on every API call |
| `offline` | the browser treats the network as down; offline bar and cached last search |
| `rate-limited` | every API call returns 429 with `Retry-After: 30` |
| `forbidden` | signed-in endpoints return 403 |
| `demo-on` / `demo-off` | override the demo flag |

## Architecture

```
src/
  app/                    pages (route groups: public, patient, hospital, provider, driver, admin) and app/api/[...path]
  components/             ui primitives, shared, trust, emergency, hospitals, ambulance, portal, admin, maps
  hooks/  lib/            api wrapper, auth provider, Firebase client, Zod schemas (shared with the server), formatting
  messages/               en.json, hi.json (complete, key parity enforced by a test)
  server/
    config/               env.ts (Zod-validated), constants
    http/                 router (auth -> policy -> rate limit -> validation -> handler -> envelope), rate limiter, scenarios
    auth/                 verifyToken (Firebase ID token or demo token), policies.ts: can(user, action, resource)
    db/                   DocStore interface, MemoryStore, FirestoreStore
    repositories/         collection names and document types (Part E)
    domain/               capabilityMap, confidence tiers, bookingStateMachine, ranking, geo
    adapters/             ai (Gemini + rule-based), maps (Routes + haversine), notifier, health
    services/             search, hospitals, availability, bookings, dispatch, driver, reviews, admin, config, audit, ...
    jobs/                 freshness sweep, demo ticker, booking timeout, retention cleanup
    routes/               the API route table (Part D)
    seed/                 deterministic fictional data (used by the memory store and scripts/seed.ts)
firestore.rules  firestore.indexes.json  storage.rules  firebase.json
```

**Safety rules built into the code:**
- **Eligibility gate.** A hospital appears as a match only if it is approved and has every required capability Confirmed or Reported. AI can add preferences but never removes requirements, and ratings never affect eligibility.
- **Explanations come only from stored facts.** They are structured reason codes, rendered by i18n.
- **Booking idempotency.** The `Idempotency-Key` and the booking are written in one transaction, so a double tap creates exactly one booking.
- **Assignment conflicts.** Vehicle assignment runs in a transaction; a second simultaneous assign of the same vehicle gets 409.
- **Live location.** Points are accepted only while the trip is Assigned or En Route, throttled to 5 s. The ETA is hidden when the latest point is older than 30 s.
- **Masking.** Fields a viewer may not see are omitted on the server, not just hidden in the UI.

**Real-time:** with Firebase auth the booking page and hospital inbox subscribe with Firestore `onSnapshot` (rules restrict reads) and refetch the filtered API view on change. Otherwise they poll every 2–4 s.

**Demo dispatch:** simulated providers advance bookings on a schedule. The ticker runs lazily on reads and from `/api/jobs/demo-ticker`, and catches up missed steps, so it works on serverless hosts.

## API

All endpoints are under `/api` and return `{ ok, data, meta: { requestId, degraded? } }` or `{ ok: false, error: { code, message, details? }, meta }`. The full table is in [src/server/routes/index.ts](src/server/routes/index.ts). Error codes and HTTP statuses follow Part C.5.

## Testing

```bash
pnpm lint
```
```bash
pnpm typecheck
```
```bash
pnpm test
```
```bash
pnpm test:e2e
```
```bash
pnpm test:rules
```

- `pnpm test`: Vitest. Domain rules, API integration against the real router with a seeded store, components (React Testing Library + jest-axe), message parity, and colour-contrast checks on the tokens.
- `pnpm test:e2e`: Playwright at 360 px against the running app, with axe scans that fail on any serious or critical violation.
- `pnpm test:rules`: Firestore security rules in the emulator. Needs `firebase-tools` and Java.

Results of the last run are recorded in [docs/TEST_RESULTS.md](docs/TEST_RESULTS.md).

## Deployment (Vercel)

1. Import the repo and set the environment variables (Firebase mode, `RATE_LIMIT_SALT`, `CRON_SECRET`).
2. [vercel.json](vercel.json) schedules the jobs. Vercel Cron calls `GET` with `Authorization: Bearer $CRON_SECRET`, and the job routes accept GET and POST. Per-minute schedules need a paid Vercel plan; on Hobby use daily schedules, or call the jobs from another scheduler.
3. Deploy Firestore rules, indexes and TTL policies (see above). Restrict the Maps key by HTTP referrer and the Routes/Gemini keys by API.
4. The service worker (`public/sw.js`) registers only in production builds.

## Live demo checklist

See [docs/DEMO_CHECKLIST.md](docs/DEMO_CHECKLIST.md).

## Known limitations

- **Address search** uses a small built-in list of localities (no geocoding API). GPS and the city-centre fallback always work.
- **Maps** need `NEXT_PUBLIC_GOOGLE_MAPS_KEY`; without it every map view shows a notice next to its list equivalent. Without a Map ID, Google's `DEMO_MAP_ID` is used.
- **The in-memory store** is per server process and resets on restart. Use Firestore for anything shared or persistent.
- **Push notifications** are not set up; notifications are in-app records only.
- **Hindi translations** were written for this build and should be reviewed by a native speaker, especially the medical terms, before real use.
- **Legal pages** are placeholders and need legal review.
- **Lighthouse** has not been run; accessibility is checked with axe in unit and e2e tests.

See [docs/DECISIONS.md](docs/DECISIONS.md) for deviations from the spec and backend contract assumptions.
# resqcare
