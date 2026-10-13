import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-resqcare",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "hospitals/h-ok"), { verificationStatus: "approved" });
    await setDoc(doc(db, "hospitals/h-pending"), { verificationStatus: "pending" });
    await setDoc(doc(db, "ambulanceBookings/b1"), {
      patientUid: "alice", providerId: "p1", candidateProviderIds: ["p1"], driverId: "drv1", destinationHospitalId: "h-ok", status: "EnRoute",
    });
    await setDoc(doc(db, "ambulanceBookings/b1/locations/l1"), { lat: 1, lng: 1 });
    await setDoc(doc(db, "emergencyRequests/e1"), { patientRef: "alice", hospitalId: "h-ok" });
    await setDoc(doc(db, "emergencyRequestContacts/e1"), { phone: "+91..." });
    await setDoc(doc(db, "reviews/r1"), { status: "approved" });
    await setDoc(doc(db, "reviews/r2"), { status: "pending" });
    await setDoc(doc(db, "auditLogs/a1"), { hospitalId: "h-ok" });
  });
});

afterAll(async () => env?.cleanup());

const as = (uid: string | null, claims: Record<string, unknown> = {}) =>
  uid ? env.authenticatedContext(uid, claims).firestore() : env.unauthenticatedContext().firestore();

describe("firestore rules", () => {
  it("allows public reads of approved hospitals only", async () => {
    await assertSucceeds(getDoc(doc(as(null), "hospitals/h-ok")));
    await assertFails(getDoc(doc(as(null), "hospitals/h-pending")));
  });

  it("denies every client write", async () => {
    await assertFails(setDoc(doc(as("alice", { role: "super_admin" }), "hospitals/h-new"), { name: "x" }));
    await assertFails(setDoc(doc(as("alice"), "ambulanceBookings/b2"), { patientUid: "alice" }));
    await assertFails(setDoc(doc(as("alice"), "users/alice"), { role: "super_admin" }));
  });

  it("lets only the owner and assigned parties read a booking", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "ambulanceBookings/b1")));
    await assertSucceeds(getDoc(doc(as("drv1", { role: "driver" }), "ambulanceBookings/b1")));
    await assertSucceeds(getDoc(doc(as("d1", { role: "dispatcher", providerId: "p1" }), "ambulanceBookings/b1")));
    await assertFails(getDoc(doc(as("mallory"), "ambulanceBookings/b1")));
    await assertFails(getDoc(doc(as("drv2", { role: "driver" }), "ambulanceBookings/b1")));
    await assertFails(getDoc(doc(as(null), "ambulanceBookings/b1")));
  });

  it("limits live location to the owner and provider during an active trip", async () => {
    await assertSucceeds(getDoc(doc(as("alice"), "ambulanceBookings/b1/locations/l1")));
    await assertFails(getDoc(doc(as("hs", { role: "hospital_staff", hospitalId: "h-ok" }), "ambulanceBookings/b1/locations/l1")));
  });

  it("scopes the hospital inbox and never exposes contacts", async () => {
    await assertSucceeds(getDoc(doc(as("hs", { role: "hospital_staff", hospitalId: "h-ok" }), "emergencyRequests/e1")));
    await assertFails(getDoc(doc(as("hs2", { role: "hospital_staff", hospitalId: "h-other" }), "emergencyRequests/e1")));
    await assertFails(getDoc(doc(as("hs", { role: "hospital_admin", hospitalId: "h-ok" }), "emergencyRequestContacts/e1")));
  });

  it("hides pending reviews and scopes audit logs", async () => {
    await assertSucceeds(getDoc(doc(as(null), "reviews/r1")));
    await assertFails(getDoc(doc(as(null), "reviews/r2")));
    await assertSucceeds(getDoc(doc(as("ha", { role: "hospital_admin", hospitalId: "h-ok" }), "auditLogs/a1")));
    await assertFails(getDoc(doc(as("hs", { role: "hospital_staff", hospitalId: "h-ok" }), "auditLogs/a1")));
  });
});
