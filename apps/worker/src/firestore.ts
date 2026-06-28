import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import admin from "firebase-admin";
import { env } from "./env";

function loadServiceAccount(): Record<string, unknown> {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    const absolute = resolve(env.FIREBASE_SERVICE_ACCOUNT_PATH);
    return JSON.parse(readFileSync(absolute, "utf8"));
  }
  throw new Error(
    "no firebase credential — set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_PATH",
  );
}

if (!admin.apps.length) {
  const credential = admin.credential.cert(loadServiceAccount() as admin.ServiceAccount);
  admin.initializeApp({ credential });
}

export const db = admin.firestore();
