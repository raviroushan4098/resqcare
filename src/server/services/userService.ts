import type { Me } from "@/lib/schemas";
import { authorize } from "../auth/policies";
import { setRoleClaims } from "../auth/verifyToken";
import { env } from "../config/env";
import { conflict, notFound } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type ApplicationDoc, type UserDoc } from "../repositories/collections";
import { audit } from "./auditService";

const toMe = (u: UserDoc): Me => ({
  uid: u.id, displayName: u.displayName, email: u.email, phone: u.phone, role: u.role, hospitalId: u.hospitalId,
  providerId: u.providerId, permissions: u.permissions, locale: u.locale,
});

/**
 * Creates or syncs the profile after sign-in. New users always get the
 * patient role; privileged roles only come from admin approval.
 */
export async function syncSession(ctx: Ctx, input: { displayName?: string; locale?: "en" | "hi"; consent?: boolean }) {
  const user = ctx.user!;
  const at = ctx.now.toISOString();
  const existing = await ctx.store.get<UserDoc>(C.users, user.uid);
  if (existing) {
    // Invited staff become active on first sign-in.
    const patch: Partial<UserDoc> = {
      lastLoginAt: at,
      updatedAt: at,
      ...(existing.status === "invited" ? { status: "active" } : {}),
      // Registration (consent given) upgrades a phone-verified guest to a full patient account.
      ...(input.consent && !existing.consentAt ? { consentAt: at, isGuest: false, ...(input.displayName ? { displayName: input.displayName } : {}) } : {}),
    };
    await ctx.store.update(C.users, user.uid, patch);
    if (env().AUTH_MODE === "firebase") await setRoleClaims(user.uid, { role: existing.role, hospitalId: existing.hospitalId, providerId: existing.providerId });
    return toMe({ ...existing, ...patch });
  }
  let email: string | null = null;
  let phone: string | null = null;
  if (env().AUTH_MODE === "firebase") {
    const { adminAuth } = await import("../firebase/admin");
    const record = await adminAuth().getUser(user.uid);
    email = record.email ?? null;
    phone = record.phoneNumber ?? null;
  }
  const doc: UserDoc = {
    id: user.uid, displayName: input.displayName || user.displayName || "User", email, phone, role: "patient",
    hospitalId: null, providerId: null, permissions: [], locale: input.locale ?? "en", status: "active",
    consentAt: input.consent ? at : null, lastLoginAt: at, createdAt: at, updatedAt: at, isGuest: user.isGuest && !input.consent,
  };
  await ctx.store.set(C.users, user.uid, doc);
  await setRoleClaims(user.uid, { role: "patient", hospitalId: null, providerId: null });
  return toMe(doc);
}

export async function getMe(ctx: Ctx): Promise<Me> {
  const u = await ctx.store.get<UserDoc>(C.users, ctx.user!.uid);
  if (u) return toMe(u);
  const a = ctx.user!;
  return { uid: a.uid, displayName: a.displayName, email: null, phone: null, role: a.role, hospitalId: a.hospitalId, providerId: a.providerId, permissions: a.permissions, locale: "en" };
}

export async function patchMe(ctx: Ctx, patch: { displayName?: string; locale?: "en" | "hi" }) {
  const u = await ctx.store.get<UserDoc>(C.users, ctx.user!.uid);
  if (!u) throw notFound("Profile");
  await ctx.store.update(C.users, u.id, { ...patch, updatedAt: ctx.now.toISOString() });
  return toMe({ ...u, ...patch });
}

/** Account deletion request: the profile is anonymized by the retention job within 30 days. */
export async function requestDeletion(ctx: Ctx) {
  const u = await ctx.store.get<UserDoc>(C.users, ctx.user!.uid);
  if (!u) throw notFound("Profile");
  await ctx.store.update(C.users, u.id, { deletionRequestedAt: ctx.now.toISOString(), updatedAt: ctx.now.toISOString() });
  await audit(ctx, { action: "user.deletion.request", resourceType: "user", resourceId: u.id });
  return { scheduled: true };
}

export async function applyForRole(ctx: Ctx, input: { type: "hospital" | "provider"; orgName: string; city: string; registryRef: string; contactPhone: string }) {
  authorize(ctx.user, "auth.apply");
  const pending = await ctx.store.query<ApplicationDoc>(C.applications, { where: [["uid", "==", ctx.user.uid], ["status", "==", "pending"]] });
  if (pending.length) throw conflict("You already have a pending application");
  const id = ctx.store.newId("app_");
  const at = ctx.now.toISOString();
  await ctx.store.set(C.applications, id, { id, uid: ctx.user.uid, ...input, status: "pending", reason: null, createdAt: at, updatedAt: at } satisfies ApplicationDoc);
  await audit(ctx, { action: "application.create", resourceType: "application", resourceId: id, after: { type: input.type, orgName: input.orgName } });
  return { id, status: "pending" };
}
