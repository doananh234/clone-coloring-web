import admin from "firebase-admin";
import { env } from "./env";

if (!admin.apps.length) {
  const credential = admin.credential.cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON));
  admin.initializeApp({ credential });
}

export const db = admin.firestore();
