import "server-only";
import { env } from "../config/env";
import { AppError } from "../errors/AppError";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/svg+xml"];
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Stores a verification document. Firestore mode writes to Firebase Storage
 * (private; read through short-lived signed URLs). Memory mode keeps the data
 * URL inline so the demo needs no bucket.
 */
export async function storeDocument(hospitalId: string, verificationId: string, doc: { name: string; contentType: string; dataUrl: string }) {
  if (!ALLOWED.includes(doc.contentType)) throw new AppError("VALIDATION_FAILED", "Unsupported file type", { details: [{ path: "documents", issue: "type" }] });
  const m = /^data:([^;]+);base64,(.+)$/.exec(doc.dataUrl);
  if (!m || m[1] !== doc.contentType) throw new AppError("VALIDATION_FAILED", "Invalid file", { details: [{ path: "documents", issue: "encoding" }] });
  const bytes = Buffer.from(m[2]!, "base64");
  if (bytes.length > MAX_BYTES) throw new AppError("VALIDATION_FAILED", "File too large (max 2 MB)", { details: [{ path: "documents", issue: "size" }] });
  if (env().DATA_BACKEND !== "firestore") return { name: doc.name, contentType: doc.contentType, path: doc.dataUrl };
  const { adminStorage } = await import("../firebase/admin");
  const safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const path = `verifications/${hospitalId}/${verificationId}/${safeName}`;
  await adminStorage().bucket().file(path).save(bytes, { contentType: doc.contentType, resumable: false });
  return { name: doc.name, contentType: doc.contentType, path };
}

/** Viewable URL for a stored document (signed for 15 minutes in Firestore mode). */
export async function documentUrl(path: string) {
  if (path.startsWith("data:") || path.startsWith("/")) return path;
  const { adminStorage } = await import("../firebase/admin");
  const [url] = await adminStorage().bucket().file(path).getSignedUrl({ action: "read", expires: Date.now() + 15 * 60_000 });
  return url;
}
