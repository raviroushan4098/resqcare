# Live demo checklist

Run on a phone-sized window (360 px) unless stated. Default mode: `pnpm dev`, memory store, demo auth.

## Before the demo
- [ ] `pnpm dev` is running; http://localhost:3000/api/health returns `{"ok":true}`
- [ ] The Dev panel shows scenario **normal**
- [ ] Admin > Providers > Demo providers: demo mode on, simulate dispatch on. Use 3 s / 3 s delays for a quick demo

## Patient flows
- [ ] **Home**: "Find a hospital now" is visible without scrolling; Call 112 / 108 / 102 are at the bottom
- [ ] **Emergency search**: tap Stroke, then "Enter address or place", then Pari Chowk, then Find hospitals. Each card shows tiers with times and "estimate" on distance and ETA
- [ ] **Location denied**: block location in the browser, tap "Use my location"; manual entry appears and search still works
- [ ] **Compare**: tick 2–3 results, then Compare
- [ ] **Share with hospital**: on a card, the consent dialog lists exactly what is shared
- [ ] **Hospital profile** (`/hospitals/h-001`): stale availability reads "Reported, call to confirm"; reviews sit in a separate, labelled section
- [ ] **Ambulance as guest** (`/ambulance?hospital=h-001`): DEMO MODE banner shows; the code is 123456; double-tap Confirm and only one booking is created
- [ ] **Booking status**: "Requested / Searching", not confirmed, then Accepted, Assigned, En Route (live ETA as an estimate), Arrived, Completed
- [ ] **Share tracking link**: open it in a private window; it gives a limited view with no contact details

## Degraded scenarios (Dev panel)
- [ ] **ai-down**: search still works and shows "Smart matching unavailable"
- [ ] **maps-down**: "Distances are approximate"
- [ ] **no-match**: no confident match, nearest hospitals to call, emergency numbers
- [ ] **offline**: offline bar; the last search still shows from cache; emergency numbers work
- [ ] **rate-limited**: friendly "try again in 30 seconds"
- [ ] **slow**: skeletons appear and the emergency bar stays visible
- [ ] **demo-off**: no demo banner; requests need non-demo providers (none are seeded), so the "no providers" path appears with 108 and hospital call options

## Staff flows
- [ ] **Hospital staff** (role switcher): dashboard shows the stale-availability alert; Update availability works with +/-; a second tab saving first causes the conflict, then "Apply my change again"
- [ ] **Hospital staff**: the Staff section is hidden, and `/api/hospital/staff` returns 403
- [ ] **Hospital admin**: staff management, facilities ("We have this" makes a facility Reported), document upload, audit
- [ ] **Incoming requests**: after "Share with hospital" from a patient, the request appears; Decline requires a reason; staff see the contact as hidden
- [ ] **Dispatcher**: with simulate dispatch off, accept, then Assign vehicle; assigning the same vehicle twice gives the 409 message
- [ ] **Driver**: Start trip, Arrived, Complete trip (one step at a time); location sharing stops on its own

## Admin flows
- [ ] **Dashboard**: 5 KPIs, queues, integration health (fallbacks are honest); weights not totalling 1.00 cannot be saved
- [ ] **Hospitals**: open a pending hospital; reject needs a reason; approve with the checklist, which appears in the audit trail
- [ ] **Providers**: suspending needs confirmation and a reason
- [ ] **Analytics**: every chart has "View as table"; CSV export; the disclaimer is visible

## Language and accessibility
- [ ] Switch to हिन्दी: the whole UI changes without a reload; Devanagari renders; no clipped text at 360 px
- [ ] Keyboard only: skip link, visible focus, category tiles with arrow keys, dialogs trap focus and Escape closes them
