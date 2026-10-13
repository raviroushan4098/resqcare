import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "jest-axe";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigForm } from "@/components/admin/ConfigForm";
import { BookingForm } from "@/components/ambulance/BookingForm";
import { BookingTimeline } from "@/components/ambulance/BookingTimeline";
import { DemoBanner } from "@/components/ambulance/DemoBanner";
import { LiveMap } from "@/components/ambulance/LiveMap";
import { CategoryPicker } from "@/components/emergency/CategoryPicker";
import { LocationGate } from "@/components/emergency/LocationGate";
import { ResultCard } from "@/components/emergency/ResultCard";
import { AvailabilityMeter } from "@/components/hospitals/AvailabilityMeter";
import { StatStepper } from "@/components/portal/StatStepper";
import { ErrorState } from "@/components/shared/ErrorState";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { StatusBanner } from "@/components/shared/StatusBanner";
import { ConfidenceBadge } from "@/components/trust/ConfidenceBadge";
import { StarRating } from "@/components/trust/StarRating";
import { VerifiedBadge } from "@/components/trust/VerifiedBadge";
import type { SearchResult } from "@/lib/schemas";
import { server } from "@/test/msw";
import { renderApp } from "@/test/providers";

const router = { replace: vi.fn(), push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/hospital/dashboard",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const auth = { status: "signedOut" as "loading" | "signedOut" | "signedIn", me: null as null | { role: string; uid: string; permissions: string[]; displayName: string } };
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ ...auth, mode: "demo", signInDemo: vi.fn(), signInGuest: vi.fn(async () => ({})), signOut: vi.fn(), refresh: vi.fn() }),
}));

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const RESULT: SearchResult = {
  hospitalId: "h-001", name: "Sanjeevani Hospital (fictional)", rank: 1, score: 0.8, verification: "approved", distanceKm: 4.1, etaMinutes: 11, etaIsEstimate: true,
  facilities: [{ capability: "ct_scan", tier: "confirmed", verifiedAt: ago(60) }],
  availability: { icuBeds: 2, emergencyBeds: 3, ventilators: 1, tier: "reported", updatedAt: ago(540) },
  matchedBecause: [{ code: "has_capability", capability: "ct_scan", tier: "confirmed" }],
  unconfirmed: [{ code: "availability_stale" }],
  phone: "+91 00000 10000", lat: 28.47, lng: 77.5,
};

beforeEach(() => {
  router.replace.mockReset();
  auth.status = "signedOut";
  auth.me = null;
});

describe("ConfidenceBadge", () => {
  it.each([
    ["confirmed", "Confirmed"],
    ["reported", "Reported, call to confirm"],
    ["unknown", "Unknown"],
  ] as const)("renders %s with icon and text, never colour alone", (tier, text) => {
    const { container } = renderApp(<ConfidenceBadge tier={tier} updatedAt={tier === "unknown" ? null : ago(120)} />);
    expect(screen.getAllByText(text, { exact: false }).length).toBeGreaterThan(0);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("gives screen readers tier and time together", () => {
    renderApp(<ConfidenceBadge tier="confirmed" updatedAt={ago(120)} />);
    expect(screen.getByText("Confirmed, updated 2 hours ago")).toHaveClass("sr-only");
  });

  it("has no axe violations", async () => {
    const { container } = renderApp(<ConfidenceBadge tier="reported" updatedAt={ago(30)} label="ICU" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("VerifiedBadge and StarRating", () => {
  it("says unverified details are not confirmed", () => {
    renderApp(<VerifiedBadge state="unverified" />);
    expect(screen.getByText("Unverified: details not confirmed")).toBeInTheDocument();
  });

  it("is a keyboard-operable radio group in input mode", async () => {
    const onChange = vi.fn();
    renderApp(<StarRating value={2} onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(5);
    radios[1]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith(3);
  });
});

describe("LocationGate", () => {
  it("switches to manual entry when location is denied, and never blocks", async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3, POSITION_UNAVAILABLE: 2, message: "denied" } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    const onChange = vi.fn();
    renderApp(<LocationGate value={null} onChange={onChange} />);
    expect(screen.getByText(/To find hospitals near you/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(getCurrentPosition).toHaveBeenCalled();
    expect(await screen.findByText("Location not available")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Pari Chowk, Greater Noida" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ source: "manual", lat: 28.4646 }));
  });
});

describe("CategoryPicker", () => {
  it("supports arrow-key selection", async () => {
    const onChange = vi.fn();
    renderApp(<CategoryPicker value="cardiac" onChange={onChange} />);
    const selected = screen.getByRole("radio", { name: /Heart/ });
    expect(selected).toHaveAttribute("aria-checked", "true");
    selected.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenCalledWith("stroke");
  });
});

describe("ResultCard", () => {
  it("always shows the Call button and labels distance as an estimate", () => {
    renderApp(<ResultCard result={RESULT} userHasLocation />);
    const call = screen.getByRole("link", { name: /Call Sanjeevani Hospital/ });
    expect(call).toBeVisible();
    expect(call).toHaveAttribute("href", "tel:+910000010000");
    expect(screen.getByText(/\(estimate\)/)).toBeInTheDocument();
    expect(screen.getByText("Call to confirm")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderApp(<ResultCard result={RESULT} userHasLocation onCompareToggle={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe("AvailabilityMeter", () => {
  it("shows Unknown, never zero, when there is no data", () => {
    renderApp(<AvailabilityMeter label="ICU beds" count={null} total={null} tier="unknown" updatedAt={null} />);
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("ConfigForm", () => {
  const base = { weights: { travel: 0.3, availability: 0.2, freshness: 0.15, distance: 0.15, specialist: 0.15, rating: 0.05 }, freshness: { availabilityMinutes: 60, facilityDays: 90 }, search: { defaultRadiusKm: 10, maxRadiusKm: 25 }, demoMode: true };

  it("blocks submit unless the weights total exactly 1.00", async () => {
    const onSave = vi.fn(async () => {});
    renderApp(<ConfigForm initial={base} onSave={onSave} />);
    const save = screen.getByRole("button", { name: "Save configuration" });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Travel time" }), { target: { value: "0.5" } });
    expect(screen.getByText("Total: 1.20")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.submit(save.closest("form")!);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Travel time" }), { target: { value: "0.3" } });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});

describe("BookingForm", () => {
  it("creates exactly one request on double submit and reuses the idempotency key", async () => {
    const keys: string[] = [];
    let resolve!: () => void;
    const onSubmit = vi.fn((_b: unknown, key: string) => {
      keys.push(key);
      return new Promise<void>((r) => (resolve = r));
    });
    renderApp(<BookingForm signedIn onSubmit={onSubmit} onNoProviders={() => {}} fallbackCenter={{ lat: 28.47, lng: 77.5, name: "Greater Noida" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Enter address or place" }));
    await userEvent.click(screen.getByRole("button", { name: "Pari Chowk, Greater Noida" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Contact name/ }), "Test Person");
    await userEvent.type(screen.getByRole("textbox", { name: /Mobile number/ }), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    const confirm = screen.getByRole("button", { name: "Confirm request" });
    await userEvent.dblClick(confirm);
    fireEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ contact: { phone: "+919876543210" }, pickup: { consent: true } });
    await act(async () => resolve());
    expect(new Set(keys).size).toBe(1);
  });

  it("asks guests to verify their phone before continuing", async () => {
    renderApp(<BookingForm signedIn={false} onSubmit={vi.fn()} onNoProviders={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Enter address or place" }));
    await userEvent.click(screen.getByRole("button", { name: "Pari Chowk, Greater Noida" }));
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.type(screen.getByRole("textbox", { name: /Contact name/ }), "Test Person");
    await userEvent.type(screen.getByRole("textbox", { name: /Mobile number/ }), "9876543210");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Verify your number to continue")).toBeInTheDocument();
  });
});

describe("BookingTimeline", () => {
  it("marks the current step and shows terminal failures distinctly", () => {
    const events = [
      { state: "Requested" as const, at: ago(3), byRole: "patient" as const, note: null },
      { state: "Searching" as const, at: ago(3), byRole: "system" as const, note: null },
    ];
    const { rerender } = renderApp(<BookingTimeline status="Searching" events={events} />);
    expect(screen.getByText("Searching").closest("li")).toHaveAttribute("aria-current", "step");
    rerender(<BookingTimeline status="TimedOut" events={[...events, { state: "TimedOut", at: ago(0), byRole: "system", note: null }]} />);
    expect(screen.getByText("Timed out")).toBeInTheDocument();
    expect(document.querySelector('[aria-current="step"]')).toBeNull();
  });
});

describe("LiveMap", () => {
  const pickup = { lat: 28.47, lng: 77.5 };
  it("hides the ETA when the last location is older than 30 seconds", () => {
    renderApp(<LiveMap status="EnRoute" location={{ lat: 28.48, lng: 77.51, at: new Date(Date.now() - 60_000).toISOString() }} pickup={pickup} etaMinutes={6} />);
    expect(screen.getByText("Location not available")).toBeInTheDocument();
    expect(screen.queryByText(/Arriving in about/)).toBeNull();
  });

  it("shows the ETA as an estimate when the location is fresh", () => {
    renderApp(<LiveMap status="EnRoute" location={{ lat: 28.48, lng: 77.51, at: new Date().toISOString() }} pickup={pickup} etaMinutes={6} />);
    expect(screen.getByText(/Arriving in about .* \(estimate\)/)).toBeInTheDocument();
  });

  it("renders nothing before a vehicle is assigned", () => {
    renderApp(<LiveMap status="Accepted" location={null} pickup={pickup} etaMinutes={null} />);
    expect(screen.queryByText("Live location")).toBeNull();
    expect(screen.queryByText("Location not available")).toBeNull();
  });
});

describe("DemoBanner", () => {
  it("is shown when the demo flag is on and cannot be dismissed", async () => {
    renderApp(<DemoBanner />);
    expect(await screen.findByText("DEMO MODE. No real ambulance is dispatched.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("is hidden when demo mode is off", async () => {
    server.use(http.get("*/api/config/public", () => HttpResponse.json({ ok: true, data: { demoMode: false, emergencyNumbers: { national: "112", ambulance: "108", ambulanceAlt: "102" }, categories: [], radiusOptionsKm: [5], defaultRadiusKm: 5, maxRadiusKm: 25, freshness: { availabilityMinutes: 60, facilityDays: 90 }, demoCity: { name: "X", lat: 1, lng: 1 }, mapsEnabled: false }, meta: { requestId: "r" } })));
    const { qc } = renderApp(<DemoBanner />);
    await waitFor(() => expect(qc.getQueryData(["config", "public"])).toBeDefined());
    expect(screen.queryByText(/DEMO MODE/)).toBeNull();
  });
});

describe("ProtectedRoute", () => {
  it("redirects signed-out users to login with a return path", () => {
    renderApp(<ProtectedRoute roles={["hospital_admin"]}><p>secret</p></ProtectedRoute>);
    expect(router.replace).toHaveBeenCalledWith("/login?next=%2Fhospital%2Fdashboard");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("shows permission denied with emergency numbers for the wrong role", () => {
    auth.status = "signedIn";
    auth.me = { role: "patient", uid: "u", permissions: [], displayName: "P" };
    renderApp(<ProtectedRoute roles={["hospital_admin"]}><p>secret</p></ProtectedRoute>);
    expect(screen.getByRole("heading", { name: "You don't have access to this page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call emergency services 112" })).toHaveAttribute("href", "tel:112");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("renders children for an allowed role", () => {
    auth.status = "signedIn";
    auth.me = { role: "hospital_admin", uid: "u", permissions: [], displayName: "A" };
    renderApp(<ProtectedRoute roles={["hospital_admin"]}><p>secret</p></ProtectedRoute>);
    expect(screen.getByText("secret")).toBeInTheDocument();
  });
});

describe("StatusBanner and ErrorState", () => {
  it("uses alert for errors and status otherwise", () => {
    renderApp(<><StatusBanner variant="error" title="Bad" /><StatusBanner variant="offline" title="Off" /></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
    expect(screen.getByRole("status")).toHaveTextContent("Off");
  });

  it("maps error codes to friendly messages and always includes emergency numbers", () => {
    renderApp(<ErrorState errorCode="NETWORK_ERROR" onRetry={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/Can't reach the server/)).toBeInTheDocument();
    expect(within(alert).getByRole("link", { name: "Call emergency services 112" })).toBeInTheDocument();
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("StatStepper", () => {
  it("clamps to capacity and supports keyboard", async () => {
    const onChange = vi.fn();
    renderApp(<StatStepper label="ICU beds" value={9} max={10} onChange={onChange} />);
    const input = screen.getByRole("spinbutton", { name: "ICU beds" });
    input.focus();
    await userEvent.keyboard("{PageUp}");
    expect(onChange).toHaveBeenLastCalledWith(10);
    await userEvent.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(0);
  });
});

describe("Hindi rendering", () => {
  it("renders badges and errors in Devanagari", () => {
    renderApp(<><ConfidenceBadge tier="reported" /><ErrorState errorCode="FORBIDDEN" /></>, { locale: "hi" });
    expect(screen.getAllByText(/बताई गई, पुष्टि के लिए कॉल करें/).length).toBeGreaterThan(0);
    expect(screen.getByText("आपको इस पेज को देखने की अनुमति नहीं है।")).toBeInTheDocument();
  });
});
