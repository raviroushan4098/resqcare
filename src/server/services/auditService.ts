import type { Ctx } from "../http/router";
import { C, type AuditDoc } from "../repositories/collections";

/** Append-only audit trail for every sensitive action (Part C.6). */
export async function audit(
  ctx: Pick<Ctx, "store" | "user" | "now" | "ipHash">,
  e: { action: string; resourceType: string; resourceId: string; hospitalId?: string | null; before?: unknown; after?: unknown },
) {
  const id = ctx.store.newId("al_");
  const doc: AuditDoc = {
    id,
    actorUid: ctx.user?.uid ?? "system",
    actorRole: ctx.user?.role ?? "system",
    action: e.action,
    resourceType: e.resourceType,
    resourceId: e.resourceId,
    hospitalId: e.hospitalId ?? null,
    before: e.before ?? null,
    after: e.after ?? null,
    ipHash: ctx.ipHash ?? null,
    createdAt: ctx.now.toISOString(),
  };
  await ctx.store.set(C.auditLogs, id, doc);
}

export async function listAudit(
  ctx: Pick<Ctx, "store">,
  q: { hospitalId?: string; resourceType?: string; resourceId?: string; actorUid?: string; limit?: number },
) {
  const where: [string, "==", unknown][] = [];
  if (q.hospitalId) where.push(["hospitalId", "==", q.hospitalId]);
  if (q.resourceType) where.push(["resourceType", "==", q.resourceType]);
  if (q.resourceId) where.push(["resourceId", "==", q.resourceId]);
  if (q.actorUid) where.push(["actorUid", "==", q.actorUid]);
  return ctx.store.query<AuditDoc>(C.auditLogs, { where, orderBy: [["createdAt", "desc"]], limit: q.limit ?? 50 });
}
