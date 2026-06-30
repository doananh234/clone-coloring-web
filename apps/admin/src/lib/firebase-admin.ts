import { initializeApp, getApps, cert, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import * as fs from "fs";
import * as path from "path";

function getServiceAccount(): ServiceAccount | undefined {
  const envJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (envJson) {
    try {
      return JSON.parse(envJson) as ServiceAccount;
    } catch {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON");
    }
  }

  const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return JSON.parse(fs.readFileSync(envPath, "utf-8")) as ServiceAccount;
  }

  const candidates = ["service-account.development.json", "service-account.production.json"];

  for (const name of candidates) {
    const fullPath = path.resolve(process.cwd(), name);
    if (fs.existsSync(fullPath)) {
      return JSON.parse(fs.readFileSync(fullPath, "utf-8")) as ServiceAccount;
    }

    const monoPath = path.resolve(process.cwd(), "../..", name);
    if (fs.existsSync(monoPath)) {
      return JSON.parse(fs.readFileSync(monoPath, "utf-8")) as ServiceAccount;
    }
  }

  return undefined;
}

const adminApp =
  getApps().length === 0
    ? (() => {
        const sa = getServiceAccount();
        if (sa) {
          const projectId = (sa as Record<string, string>).project_id;
          return initializeApp({
            credential: cert(sa),
            projectId,
          });
        }
        return initializeApp();
      })()
    : getApps()[0];

export const adminAuth = getAuth(adminApp);
export default adminApp;
