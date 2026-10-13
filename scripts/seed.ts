/**
 * Seeds Firestore (emulator or a real project) with the fictional demo data,
 * and in AUTH_MODE=firebase creates one sign-in account per role with custom claims.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm seed
 *
 * Demo account password: SEED_PASSWORD (default "Demo-Pass-2026!"). Never use on production data.
 */
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { FirestoreStore } from "../src/server/db/firestoreStore";
import { DEMO_USERS } from "../src/server/seed/data";
import { seedStore } from "../src/server/seed/seed";

const projectId = process.env.FIREBASE_PROJECT_ID ?? "demo-resqcare";
const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (!emulator && process.env.SEED_CONFIRM !== "yes") {
  console.error(`Refusing to seed real project "${projectId}" without SEED_CONFIRM=yes.`);
  process.exit(1);
}

const app = initializeApp({
  projectId,
  ...(!emulator && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY
    ? { credential: cert({ projectId, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }
    : {}),
});
const db = getFirestore(app);
db.settings({ ignoreUndefinedProperties: true });

async function main() {
  const store = new FirestoreStore(db);
  await seedStore(store, new Date(), {
    demoModeDefault: process.env.DEMO_MODE_DEFAULT !== "false",
    onProgress: (m) => console.warn(`  seeded ${m}`),
  });

  if (process.env.AUTH_MODE === "firebase" || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    const auth = getAuth(app);
    const password = process.env.SEED_PASSWORD ?? "Demo-Pass-2026!";
    for (const u of DEMO_USERS) {
      try {
        await auth.getUser(u.id);
      } catch {
        await auth.createUser({ uid: u.id, email: u.email, password, displayName: u.displayName, emailVerified: true });
      }
      await auth.setCustomUserClaims(u.id, { role: u.role, ...(u.hospitalId ? { hospitalId: u.hospitalId } : {}), ...(u.providerId ? { providerId: u.providerId } : {}) });
      console.warn(`  auth user ${u.email} (${u.role})`);
    }
  }
  console.warn("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
