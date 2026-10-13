import { z } from "zod";
import { SafeText } from "./common";
import { LIMITS } from "../constants";

export const CreateReviewSchema = z.object({
  hospitalId: z.string(),
  rating: z.number().int().min(1).max(5),
  text: SafeText(LIMITS.reviewMin, LIMITS.reviewMax),
  visitDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

export const ReportReviewSchema = z.object({
  reason: z.enum(["abusive", "spam", "personal_info", "false_info", "other"]),
});

export interface ReviewView {
  id: string;
  hospitalId: string;
  hospitalName: string;
  authorName: string;
  rating: number;
  text: string;
  visitDate: string | null;
  verifiedVisit: boolean;
  createdAt: string;
  status: "pending" | "approved" | "rejected" | "removed";
  response: { text: string; at: string } | null;
}
