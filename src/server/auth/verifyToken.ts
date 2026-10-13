import "server-only";
import type { Role } from "@/lib/schemas";
import { env } from "../config/env";
import type { DocStore } from "../db/store";
import { AppError } from "../errors/AppError";
import { C, type UserDoc } from "../repositories/collections";
import type { AuthUser } from "./roles";

const DEMO_PREFIX = "demo.";
/** Demo guests (phone-verified, no account) use ids like guest_ab12cd34. */
const GUEST_ID = /^guest_[a-z0-9]{8,32}$/;

function fromDoc(doc: UserDoc, claims?: { role?: Role; hospitalId?: string; providerId?: string }): AuthUser {
  if (doc.status === "disabled") throw new AppError("FORBIDDEN", "Account disabled");
  return {
    uid: doc.id,
    // Custom claims are authoritative in Firebase mode; the doc mirrors them.
    role: claims?.role ?? doc.role,
    hospitalId: claims?.hospitalId ?? doc.hospitalId,
    providerId: claims?.providerId ?? doc.providerId,
    permissions: doc.permissions ?? [],
    displayName: doc.displayName,
    isGuest: doc.isGuest ?? doc.id.startsWith("guest_"),
  };
}

/**
 * Resolves the caller from the Authorization header.
 * - firebase: verifies the Firebase ID token with the Admin SDK and reads custom claims.
 * - demo:     accepts `demo.<uid>` for seeded users and demo guests (never in production).
 * Returns null for anonymous requests; throws 401 for bad tokens.
 */
export async function verifyRequestUser(authHeader: string | null, store: DocStore): Promise<AuthUser | null> {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!match) throw new AppError("UNAUTHENTICATED", "Malformed authorization header");
  const token = match[1]!.trim();

  if (env().AUTH_MODE === "demo") {
    if (!token.startsWith(DEMO_PREFIX)) throw new AppError("UNAUTHENTICATED", "Invalid token");
    const uid = token.slice(DEMO_PREFIX.length);
    const doc = await store.get<UserDoc>(C.users, uid);
    if (doc) return fromDoc(doc);
    if (GUEST_ID.test(uid)) {
      return { uid, role: "patient", hospitalId: null, providerId: null, permissions: [], displayName: "Guest", isGuest: true };
    }
    throw new AppError("UNAUTHENTICATED", "Unknown demo user");
  }

  const { adminAuth } = await import("../firebase/admin");
  let decoded;
  try {
    decoded = await adminAuth().verifyIdToken(token, true);
  } catch {
    throw new AppError("UNAUTHENTICATED", "Session expired or invalid");
  }
  const claims = { role: decoded.role as Role | undefined, hospitalId: decoded.hospitalId as string | undefined, providerId: decoded.providerId as string | undefined };
  const doc = await store.get<UserDoc>(C.users, decoded.uid);
  if (doc) return fromDoc(doc, claims);
  // First call before POST /auth/session created the profile.
  return {
    uid: decoded.uid,
    role: claims.role ?? "patient",
    hospitalId: claims.hospitalId ?? null,
    providerId: claims.providerId ?? null,
    permissions: [],
    displayName: decoded.name ?? "User",
    isGuest: !decoded.email && decoded.firebase?.sign_in_provider === "phone",
  };
}

/** Sets custom claims in Firebase mode. Only server code calls this (admin approval flow). */
export async function setRoleClaims(uid: string, claims: { role: Role; hospitalId: string | null; providerId: string | null }) {
  if (env().AUTH_MODE !== "firebase") return;
  const { adminAuth } = await import("../firebase/admin");
  await adminAuth().setCustomUserClaims(uid, {
    role: claims.role,
    ...(claims.hospitalId ? { hospitalId: claims.hospitalId } : {}),
    ...(claims.providerId ? { providerId: claims.providerId } : {}),
  });
}
