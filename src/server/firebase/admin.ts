import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { env } from "../config/env";

let app: App | null = null;

/** Single Admin SDK app. Uses the emulator when FIRESTORE_EMULATOR_HOST is set. */
export function adminApp(): App {
  if (app) return app;
  const e = env();
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const useServiceAccount = e.FIREBASE_CLIENT_EMAIL && e.FIREBASE_PRIVATE_KEY && !e.FIRESTORE_EMULATOR_HOST;
  app = initializeApp({
    projectId: e.FIREBASE_PROJECT_ID,
    storageBucket: e.FIREBASE_STORAGE_BUCKET,
    ...(useServiceAccount
      ? {
          credential: cert({
            projectId: e.FIREBASE_PROJECT_ID,
            clientEmail: e.FIREBASE_CLIENT_EMAIL,
            // .env files keep the key on one line with literal \n.
            privateKey: e.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
          }),
        }
      : {}),
  });
  return app;
}

let db: Firestore | null = null;
export function adminDb(): Firestore {
  if (!db) {
    db = getFirestore(adminApp());
    db.settings({ ignoreUndefinedProperties: true });
  }
  return db;
}

export const adminAuth = () => getAuth(adminApp());
export const adminStorage = () => getStorage(adminApp());
