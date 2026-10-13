import type { DocStore } from "../../db/store";
import { C, type NotificationDoc } from "../../repositories/collections";
import { recordHealth } from "../health";

const SIXTY_DAYS = 60 * 24 * 3600 * 1000;

/** In-app notification (FCM push can be added behind the same function). */
export async function notify(store: DocStore, n: Omit<NotificationDoc, "id" | "readAt" | "createdAt" | "expiresAt">, now = new Date()) {
  try {
    const id = store.newId("n_");
    await store.set(C.notifications, id, {
      ...n,
      id,
      readAt: null,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + SIXTY_DAYS).toISOString(),
    });
    recordHealth("notifications", true);
  } catch {
    recordHealth("notifications", false, "write failed");
  }
}
