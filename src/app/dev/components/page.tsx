"use client";

import { notFound } from "next/navigation";
import { useState, type ReactNode } from "react";
import { AuditTable } from "@/components/admin/AuditTable";
import { ChartCard } from "@/components/admin/ChartCard";
import { ConfigForm } from "@/components/admin/ConfigForm";
import { DataTable } from "@/components/admin/DataTable";
import { KpiTile } from "@/components/admin/KpiTile";
import { BookingTimeline } from "@/components/ambulance/BookingTimeline";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { DriverCard } from "@/components/ambulance/DriverCard";
import { LiveMap } from "@/components/ambulance/LiveMap";
import { CategoryPicker } from "@/components/emergency/CategoryPicker";
import { EmergencyBar } from "@/components/emergency/EmergencyBar";
import { LocationGate, type PickedLocation } from "@/components/emergency/LocationGate";
import { NoConfidentMatch } from "@/components/emergency/NoConfidentMatch";
import { RadiusSelect } from "@/components/emergency/RadiusSelect";
import { ResultCard } from "@/components/emergency/ResultCard";
import { ResultsToolbar } from "@/components/emergency/ResultsToolbar";
import { SymptomTextField } from "@/components/emergency/SymptomTextField";
import { AvailabilityMeter } from "@/components/hospitals/AvailabilityMeter";
import { CompareTable } from "@/components/hospitals/CompareTable";
import { FacilityList } from "@/components/hospitals/FacilityList";
import { HospitalCard } from "@/components/hospitals/HospitalCard";
import { EMPTY_FILTERS, HospitalFilters } from "@/components/hospitals/HospitalFilters";
import { ChecklistCard } from "@/components/portal/ChecklistCard";
import { RequestCard } from "@/components/portal/RequestCard";
import { StatStepper } from "@/components/portal/StatStepper";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { LanguageSwitch } from "@/components/shared/LanguageSwitch";
import { PageShell } from "@/components/shared/PageShell";
import { PermissionDenied } from "@/components/shared/ProtectedRoute";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { ChartSkeleton, ProfileSkeleton, ResultCardSkeleton, TableSkeleton } from "@/components/shared/Skeletons";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { ReviewCard } from "@/components/trust/ReviewCard";
import { ReviewForm } from "@/components/trust/ReviewForm";
import { StarRating } from "@/components/trust/StarRating";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import { Button } from "@/components/ui/button";
import type { BookingView, Category, HospitalSummary, SearchResult } from "@/lib/schemas";

const now = Date.now();
const ago = (m: number) => new Date(now - m * 60_000).toISOString();

const RESULT: SearchResult = {
  hospitalId: "h-001", name: "Sanjeevani Hospital (fictional)", rank: 1, score: 0.82, verification: "approved", distanceKm: 4.1, etaMinutes: 11, etaIsEstimate: true,
  facilities: [{ capability: "ct_scan", tier: "confirmed", verifiedAt: ago(60 * 24 * 3) }, { capability: "stroke_unit", tier: "reported", verifiedAt: ago(60 * 24 * 120) }],
  availability: { icuBeds: 2, emergencyBeds: 4, ventilators: 1, tier: "reported", updatedAt: ago(9 * 60) },
  matchedBecause: [{ code: "has_capability", capability: "ct_scan", tier: "confirmed" }, { code: "closest", distanceKm: 4.1 }],
  unconfirmed: [{ code: "capability_not_recent", capability: "stroke_unit" }, { code: "availability_stale" }],
  phone: "+91 00000 10000", lat: 28.47, lng: 77.5,
};
const HOSP: HospitalSummary = {
  id: "h-001", name: "Sanjeevani Hospital (fictional)", verification: "approved", verifiedAt: ago(60 * 24 * 40), address: "12 Neem Marg (fictional address)", city: "Greater Noida",
  lat: 28.47, lng: 77.5, phone: "+91 00000 10000", emergency24x7: true, specialties: ["Cardiology", "Neurology"], facilities: RESULT.facilities,
  availability: { icuBeds: 2, icuTotal: 30, emergencyBeds: 4, emergencyTotal: 20, ventilators: 1, ventilatorsTotal: 10, servicesNow: null, tier: "confirmed", updatedAt: ago(12), source: "hospital" },
  distanceKm: 4.1, isFictional: true,
};
const BOOKING: BookingView = {
  id: "b1", status: "EnRoute", demo: true, type: "als", patientCount: 1, pickup: { lat: 28.47, lng: 77.5, address: null },
  destination: { hospitalId: "h-001", name: HOSP.name, phone: HOSP.phone }, provider: { name: "Rapid Response Demo Ambulances (fictional)", phone: "+91 00000 20001" },
  vehicle: { registration: "DEMO-SIM-01", type: "als" }, driver: { firstName: "Ravi", phoneMasked: "+91 ••••• •3001", phone: "+910000030001" },
  contact: null, canRevealPhone: true, canCancel: false, isOwner: true, viewerRole: "owner",
  events: (["Requested", "Searching", "Accepted", "Assigned", "EnRoute"] as const).map((s, i) => ({ state: s, at: ago(10 - i * 2), byRole: "system", note: null })),
  lastLocation: { lat: 28.48, lng: 77.51, at: new Date(now - 5000).toISOString() }, etaMinutes: 6, searchingTimeoutAt: null, failureReason: null, createdAt: ago(10),
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-border pt-6">
      <h2>{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Development gallery: every component in its main states (not available in production). */
export default function ComponentGallery() {
  const [cat, setCat] = useState<Category | null>("stroke");
  const [loc, setLoc] = useState<PickedLocation | null>(null);
  const [text, setText] = useState("");
  const [radius, setRadius] = useState(10);
  const [rating, setRating] = useState(3);
  const [beds, setBeds] = useState(4);
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <PageShell width="wide">
      <h1>Component gallery</h1>
      <p className="text-muted">Development only. Every component with representative states; data is fictional.</p>

      <Section title="EmergencyBar (inline preview)">
        <div className="relative rounded-card border border-border p-2 [&_[data-emergency-bar]]:static">
          <EmergencyBar />
        </div>
      </Section>

      <Section title="StatusBanner">
        {(["offline", "stale", "degraded-ai", "degraded-maps", "demo", "info", "error"] as const).map((v) => <StatusBanner key={v} variant={v} title={`${v} banner`} description="Description text" />)}
      </Section>

      <Section title="Empty, Error, Permission denied, Skeletons">
        <EmptyState title="Nothing here yet" description="Try changing the filters." />
        <ErrorState errorCode="NETWORK_ERROR" onRetry={() => {}} />
        <ErrorState errorCode="RATE_LIMITED" />
        <PermissionDenied />
        <ResultCardSkeleton />
        <ProfileSkeleton />
        <TableSkeleton rows={3} />
        <ChartSkeleton />
      </Section>

      <Section title="RelativeTime, LanguageSwitch, ConfirmDialog">
        <p>Updated <RelativeTime iso={ago(125)} /></p>
        <LanguageSwitch />
        <ConfirmDialog trigger={<Button variant="danger">Open destructive confirm</Button>} title="Cancel request?" confirmLabel="Yes, cancel" destructive onConfirm={() => new Promise((r) => setTimeout(r, 500))} />
      </Section>

      <Section title="ConfidenceBadge and VerifiedBadge">
        <div className="flex flex-wrap gap-2">
          <ConfidenceBadge tier="confirmed" updatedAt={ago(120)} windowLabel="60 minutes" />
          <ConfidenceBadge tier="reported" updatedAt={ago(9 * 60)} />
          <ConfidenceBadge tier="unknown" />
          <ConfidenceBadge tier="confirmed" updatedAt={ago(5)} size="sm" label="CT scan" />
        </div>
        <div className="flex flex-wrap gap-2">
          {(["approved", "pending", "unverified", "rejected", "suspended"] as const).map((s) => <VerifiedBadge key={s} state={s} verifiedAt={ago(60 * 24 * 30)} />)}
        </div>
      </Section>

      <Section title="StarRating, ReviewCard, ReviewForm">
        <StarRating value={3.6} />
        <StarRating value={rating} onChange={setRating} />
        <ReviewCard review={{ id: "r", hospitalId: "h", hospitalName: HOSP.name, authorName: "Asha", rating: 4, text: "Quick triage and kind staff.", visitDate: null, verifiedVisit: true, createdAt: ago(600), status: "approved", response: { text: "Thank you.", at: ago(300) } }} onReport={() => {}} />
        <ReviewForm hospitals={[{ id: "h-001", name: HOSP.name }]} onSubmit={async () => {}} />
        <ReviewForm hospitals={[]} onSubmit={async () => {}} submitted />
      </Section>

      <Section title="Emergency search">
        <LocationGate value={loc} onChange={setLoc} fallbackCenter={{ lat: 28.4744, lng: 77.504, name: "Greater Noida" }} />
        <LocationGate value={{ lat: 28.47, lng: 77.5, source: "gps" }} onChange={() => {}} />
        <CategoryPicker value={cat} onChange={setCat} />
        <CategoryPicker value={null} onChange={() => {}} error="Choose what is happening" />
        <SymptomTextField value={text} onChange={setText} />
        <RadiusSelect value={radius} options={[5, 10, 15, 25]} max={25} onChange={setRadius} />
        <ResultsToolbar count={3} view="list" onView={() => {}} sort="rank" onSort={() => {}} compareCount={2} onCompare={() => {}} />
        <ResultCard result={RESULT} userHasLocation onCompareToggle={() => {}} onShare={() => {}} />
        <ResultCard result={{ ...RESULT, availability: { icuBeds: null, emergencyBeds: null, ventilators: null, tier: "unknown", updatedAt: null }, unconfirmed: [{ code: "availability_unknown" }] }} userHasLocation={false} />
        <NoConfidentMatch nearest={[{ hospitalId: "h-002", name: "Arogya Medical Centre (fictional)", phone: "+91 00000 10001", distanceKm: 2.3 }]} />
      </Section>

      <Section title="Hospitals">
        <HospitalFilters value={EMPTY_FILTERS} onChange={() => {}} />
        <HospitalCard h={HOSP} onCompareToggle={() => {}} />
        <HospitalCard h={{ ...HOSP, id: "h-x", verification: "unverified", availability: { ...HOSP.availability, tier: "unknown", icuBeds: null } }} />
        <FacilityList facilities={[...RESULT.facilities, { capability: "mri", tier: "unknown", verifiedAt: null }]} />
        <div className="grid gap-3 md:grid-cols-3">
          <AvailabilityMeter label="ICU beds" count={2} total={30} tier="confirmed" updatedAt={ago(12)} source="hospital" />
          <AvailabilityMeter label="Emergency beds" count={4} total={20} tier="reported" updatedAt={ago(540)} />
          <AvailabilityMeter label="Ventilators" count={null} total={null} tier="unknown" updatedAt={null} />
        </div>
        <CompareTable items={[HOSP, { ...HOSP, id: "h-2", name: "Arogya Medical Centre (fictional)" }]} />
      </Section>

      <Section title="Ambulance">
        <DemoBanner demo />
        <BookingTimeline status="Searching" events={BOOKING.events.slice(0, 2)} />
        <BookingTimeline status="EnRoute" events={BOOKING.events} />
        <BookingTimeline status="TimedOut" events={[...BOOKING.events.slice(0, 2), { state: "TimedOut", at: ago(1), byRole: "system", note: null }]} />
        <DriverCard booking={BOOKING} />
        <LiveMap status="EnRoute" location={BOOKING.lastLocation} pickup={BOOKING.pickup} etaMinutes={6} />
        <LiveMap status="EnRoute" location={{ lat: 28.48, lng: 77.51, at: ago(5) }} pickup={BOOKING.pickup} etaMinutes={6} />
      </Section>

      <Section title="Portal">
        <StatStepper label="ICU beds" value={beds} max={30} previous={6} onChange={setBeds} warn={beds > 20 ? "Big change" : null} />
        <ChecklistCard items={[{ key: "address", done: true, href: "#" }, { key: "facilities", done: false, href: "#" }]} />
        <RequestCard req={{ id: "er1", category: "cardiac", etaMinutes: 9, status: "new", createdAt: ago(2), declineReason: null, handledByName: null, hasContact: true, contact: null }} canRespond isNew onRespond={async () => {}} />
        <RequestCard req={{ id: "er2", category: "stroke", etaMinutes: null, status: "accepted", createdAt: ago(20), declineReason: null, handledByName: "Meena", hasContact: true, contact: { name: "Ravi", phone: "+919876543210", phoneMasked: "+91 ••••• •3210" } }} canRespond onRespond={async () => {}} />
      </Section>

      <Section title="Admin">
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiTile label="Search latency p95" value={812} unit="ms" definition="95th percentile time for successful searches." />
          <KpiTile label="Loading" value={null} definition="Loading state" loading />
          <KpiTile label="Error" value={null} definition="Error state" error />
        </div>
        <DataTable caption="Demo table" rows={[{ id: "1", name: "Alpha" }, { id: "2", name: "Beta" }]} rowId={(r) => r.id} columns={[{ key: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name, filterValue: (r) => r.name }]} selectable selected={new Set(["1"])} onSelect={() => {}} />
        <DataTable caption="Empty table" rows={[] as { id: string }[]} rowId={(r) => r.id} columns={[]} />
        <ChartCard title="Searches per day" caption="Count of searches." rows={[{ date: "2026-10-12", searches: 30 }]} columns={[{ key: "date", header: "Date" }, { key: "searches", header: "Searches" }]} chart={<div className="h-full rounded bg-bg" />} />
        <AuditTable items={[{ id: "a", actorUid: "u", actorRole: "super_admin", action: "config.update", resourceType: "systemConfiguration", resourceId: "ranking", before: { travel: 0.35 }, after: { travel: 0.3 }, createdAt: ago(60) }]} />
        <ConfigForm initial={{ weights: { travel: 0.3, availability: 0.2, freshness: 0.15, distance: 0.15, specialist: 0.15, rating: 0.05 }, freshness: { availabilityMinutes: 60, facilityDays: 90 }, search: { defaultRadiusKm: 10, maxRadiusKm: 25 }, demoMode: true }} onSave={async () => {}} />
      </Section>
    </PageShell>
  );
}
