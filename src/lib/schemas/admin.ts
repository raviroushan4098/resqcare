import { z } from "zod";
import { SafeText } from "./common";

export const VERIFICATION_CHECKLIST = ["registrationCertificate", "addressMatch", "phoneVerified", "facilityEvidence"] as const;

export const VerifyDecisionSchema = z
  .object({
    decision: z.enum(["approve", "reject", "request_info", "suspend"]),
    reason: SafeText(0, 500).optional(),
    checklist: z.object({
      registrationCertificate: z.boolean(),
      addressMatch: z.boolean(),
      phoneVerified: z.boolean(),
      facilityEvidence: z.boolean(),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.decision !== "approve" && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "reason_required" });
    }
  });
export type VerifyDecision = z.infer<typeof VerifyDecisionSchema>;

export const ProviderDecisionSchema = z
  .object({ decision: z.enum(["approve", "reject", "suspend", "reinstate"]), reason: SafeText(0, 500).optional() })
  .superRefine((v, ctx) => {
    if ((v.decision === "reject" || v.decision === "suspend") && (!v.reason || v.reason.length < 5)) {
      ctx.addIssue({ code: "custom", path: ["reason"], message: "reason_required" });
    }
  });

export const ResolveFlagSchema = z.object({ resolution: SafeText(3, 300) });
export const ModerateReviewSchema = z.object({ decision: z.enum(["approve", "reject", "remove"]) });
export const ReviewResponseSchema = z.object({ text: SafeText(5, 500) });
export const SetRoleSchema = z.object({
  role: z.enum(["patient", "hospital_admin", "hospital_staff", "dispatcher", "driver", "super_admin"]),
  hospitalId: z.string().nullable().optional(),
  providerId: z.string().nullable().optional(),
});

export interface KpiSet {
  searchLatencyP95Ms: number | null;
  dataFreshnessPct: number | null;
  bookingAcceptanceRate: number | null;
  failedRequests: number;
  dispatchCompletionRate: number | null;
}

export interface AuditEntry {
  id: string;
  actorUid: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
