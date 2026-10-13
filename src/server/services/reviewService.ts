import type { CreateReviewInput, ReviewView } from "@/lib/schemas";
import { authorize } from "../auth/policies";
import { REVIEW_COOLDOWN_MS } from "../config/constants";
import { AppError, conflict, notFound, ruleViolation } from "../errors/AppError";
import type { Ctx } from "../http/router";
import { C, type HospitalDoc, type ReviewDoc, type ReviewReportDoc, type UserDoc } from "../repositories/collections";
import { audit } from "./auditService";
import { invalidateHospitalCache } from "./hospitalService";

async function toView(ctx: Ctx, docs: ReviewDoc[]): Promise<ReviewView[]> {
  const names = new Map<string, string>();
  for (const id of new Set(docs.map((d) => d.hospitalId))) {
    names.set(id, (await ctx.store.get<HospitalDoc>(C.hospitals, id))?.name ?? "");
  }
  return docs.map((r) => ({
    id: r.id, hospitalId: r.hospitalId, hospitalName: names.get(r.hospitalId) ?? "", authorName: r.authorName, rating: r.rating,
    text: r.text, visitDate: r.visitDate, verifiedVisit: r.verifiedVisit, createdAt: r.createdAt, status: r.status,
    response: r.response ? { text: r.response.text, at: r.response.at } : null,
  }));
}

/** Only approved reviews are public. */
export async function listReviews(ctx: Ctx, q: { hospitalId?: string; rating?: number; verifiedVisit?: boolean; cursor?: string }) {
  const where: [string, "==", unknown][] = [["status", "==", "approved"]];
  if (q.hospitalId) where.push(["hospitalId", "==", q.hospitalId]);
  if (q.rating) where.push(["rating", "==", q.rating]);
  if (q.verifiedVisit) where.push(["verifiedVisit", "==", true]);
  const offset = q.cursor ? parseInt(q.cursor, 10) || 0 : 0;
  const docs = await ctx.store.query<ReviewDoc>(C.reviews, { where, orderBy: [["createdAt", "desc"]], offset, limit: 21 });
  ctx.meta.nextCursor = docs.length > 20 ? String(offset + 20) : null;
  return { items: await toView(ctx, docs.slice(0, 20)) };
}

/** One review per user per hospital per 30 days; new reviews wait for moderation. */
export async function createReview(ctx: Ctx, input: CreateReviewInput) {
  authorize(ctx.user, "review.create");
  const h = await ctx.store.get<HospitalDoc>(C.hospitals, input.hospitalId);
  if (!h) throw notFound("Hospital");
  const since = new Date(ctx.now.getTime() - REVIEW_COOLDOWN_MS).toISOString();
  const recent = await ctx.store.query<ReviewDoc>(C.reviews, {
    where: [["authorUid", "==", ctx.user.uid], ["hospitalId", "==", input.hospitalId], ["createdAt", ">=", since]],
    limit: 1,
  });
  if (recent.length) {
    throw ruleViolation("You have already reviewed this hospital in the last 30 days", [{ path: "hospitalId", issue: "duplicate_review" }]);
  }
  if (/(https?:\/\/|www\.)/i.test(input.text)) {
    throw new AppError("VALIDATION_FAILED", "Links are not allowed in reviews", { details: [{ path: "text", issue: "no_links" }] });
  }
  const me = await ctx.store.get<UserDoc>(C.users, ctx.user.uid);
  const id = ctx.store.newId("r_");
  const at = ctx.now.toISOString();
  const doc: ReviewDoc = {
    id, hospitalId: input.hospitalId, authorUid: ctx.user.uid, authorName: (me?.displayName ?? ctx.user.displayName).split(" ")[0] ?? "User",
    rating: input.rating, text: input.text, visitDate: input.visitDate ?? null, status: "pending", verifiedVisit: false, reportCount: 0, response: null,
    createdAt: at, updatedAt: at,
  };
  await ctx.store.set(C.reviews, id, doc);
  return { id, status: "pending" as const };
}

export async function reportReview(ctx: Ctx, id: string, reason: string) {
  const r = await ctx.store.get<ReviewDoc>(C.reviews, id);
  if (!r || r.status !== "approved") throw notFound("Review");
  const reporter = ctx.user?.uid ?? `anon_${ctx.ipHash}`;
  const reportId = `${id}_${reporter}`;
  const existing = await ctx.store.get<ReviewReportDoc>(C.reviewReports, reportId);
  if (existing) throw conflict("You already reported this review");
  await ctx.store.set(C.reviewReports, reportId, { id: reportId, reviewId: id, reporterUid: reporter, reason, createdAt: ctx.now.toISOString() } satisfies ReviewReportDoc);
  await ctx.store.update(C.reviews, id, { reportCount: r.reportCount + 1 });
  return { reported: true };
}

export async function respondToReview(ctx: Ctx, id: string, text: string) {
  const r = await ctx.store.get<ReviewDoc>(C.reviews, id);
  if (!r) throw notFound("Review");
  authorize(ctx.user, "hospital.review.respond", { hospitalId: r.hospitalId });
  const response = { text, by: ctx.user.uid, at: ctx.now.toISOString() };
  await ctx.store.update(C.reviews, id, { response, updatedAt: response.at });
  await audit(ctx, { action: "review.respond", resourceType: "review", resourceId: id, hospitalId: r.hospitalId, after: { text } });
  return { id, response };
}

export async function moderateReview(ctx: Ctx, id: string, decision: "approve" | "reject" | "remove") {
  authorize(ctx.user, "admin.access");
  const r = await ctx.store.get<ReviewDoc>(C.reviews, id);
  if (!r) throw notFound("Review");
  const status = { approve: "approved", reject: "rejected", remove: "removed" }[decision] as ReviewDoc["status"];
  await ctx.store.update(C.reviews, id, { status, reportCount: decision === "approve" ? 0 : r.reportCount, updatedAt: ctx.now.toISOString() });
  // Keep the hospital's rating summary in step with approved reviews.
  const approved = await ctx.store.query<ReviewDoc>(C.reviews, { where: [["hospitalId", "==", r.hospitalId], ["status", "==", "approved"]] });
  await ctx.store.update(C.hospitals, r.hospitalId, {
    ratingCount: approved.length,
    ratingAverage: approved.length ? Math.round((approved.reduce((s, x) => s + x.rating, 0) / approved.length) * 10) / 10 : null,
  });
  invalidateHospitalCache();
  await audit(ctx, { action: `review.${decision}`, resourceType: "review", resourceId: id, hospitalId: r.hospitalId, before: { status: r.status }, after: { status } });
  return { id, status };
}

export async function moderationQueue(ctx: Ctx) {
  authorize(ctx.user, "admin.access");
  const [pending, reported] = await Promise.all([
    ctx.store.query<ReviewDoc>(C.reviews, { where: [["status", "==", "pending"]], orderBy: [["createdAt", "desc"]], limit: 50 }),
    ctx.store.query<ReviewDoc>(C.reviews, { where: [["reportCount", ">", 0]], limit: 50 }),
  ]);
  return { pending: await toView(ctx, pending), reported: await toView(ctx, reported.filter((r) => r.status === "approved")) };
}
