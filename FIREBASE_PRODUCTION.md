# Connect petpa-dashboard to real Firebase production

This guide explains how to point the dashboard at **real Firebase production** (Firestore, Auth, etc.) instead of the local emulators.

## 1. Prerequisites

- A Firebase **production** project (e.g. `iroly-production`).
- A **service account key** for that project:
  - Firebase Console → Project Settings → Service accounts → **Generate new private key**.
  - Save the JSON file in the dashboard root (see below).

## 2. Service account files

Place one or both in the `petpa-dashboard` root (do **not** commit them; they should be in `.gitignore`):

| File | When it’s used |
|------|----------------------------------|
| `service-account.production.json` | Production build (`yarn build` / `yarn start`) or when `USE_FIREBASE_PRODUCTION=true` in dev |
| `service-account.development.json` | Development with emulators or a dev Firebase project |

For **production Firebase** you need at least `service-account.production.json` with the key for your production project.

## 3. Disable emulators and use production

### Option A: Development mode, but talk to production Firebase

Use production Firestore/Admin from the Next.js dev server:

1. **Disable emulators** so the app doesn’t connect to localhost:

   In `.env.development.local` (or when starting the app):

   ```bash
   USE_EMULATOR=false
   NEXT_PUBLIC_USE_EMULATOR=false
   ```

2. **Use production credentials** for the server (Firebase Admin):

   In `.env.development.local`:

   ```bash
   USE_FIREBASE_PRODUCTION=true
   ```

   This makes the server load `service-account.production.json` even when `NODE_ENV=development`.

3. **Client (browser)** uses the `NEXT_PUBLIC_FIREBASE_*` variables. Point them at the **production** project in `.env.development.local`:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=your-production-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-production-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
   NEXT_PUBLIC_FIREBASE_APP_ID=...
   ```

4. Start the dashboard:

   ```bash
   cd petpa-dashboard
   yarn dev
   ```

   You should see logs like:
   - `🔗 Firebase Admin using production services`
   - `🔗 Using production Firebase services` (client)

### Option B: Production build (recommended for real production)

1. Set in `.env.production.local` (or your production env):

   ```bash
   USE_EMULATOR=false
   NEXT_PUBLIC_USE_EMULATOR=false
   ```

   (Production builds already use `service-account.production.json` and ignore emulators unless you force them.)

2. Ensure `service-account.production.json` is present and has the production project’s key.

3. Build and run:

   ```bash
   yarn build
   yarn start
   ```

## 4. Optional: custom service account path

To use a key file from a different path (e.g. CI or a shared secret):

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=../secrets/my-production-key.json
```

Path is relative to the project root (where `yarn dev` / `yarn start` runs). This overrides the default development/production file choice.

## 5. Summary of env vars

| Variable | Effect |
|----------|--------|
| `USE_EMULATOR=false` | Server (Firebase Admin) does **not** use the Firestore emulator. |
| `NEXT_PUBLIC_USE_EMULATOR=false` | Client does **not** use Firestore/Auth emulators. |
| `USE_FIREBASE_PRODUCTION=true` | Server uses `service-account.production.json` even in development. |
| `FIREBASE_SERVICE_ACCOUNT_PATH=<path>` | Server uses this JSON file as the service account (overrides default file). |
| `NEXT_PUBLIC_FIREBASE_*` | Client project config; set to production values to talk to production. |

## 6. Quick checklist

- [ ] Production service account JSON in `service-account.production.json` (or path set in `FIREBASE_SERVICE_ACCOUNT_PATH`).
- [ ] `USE_EMULATOR=false` and `NEXT_PUBLIC_USE_EMULATOR=false` so emulators are off.
- [ ] In dev: `USE_FIREBASE_PRODUCTION=true` if you want the dev server to use production Firestore.
- [ ] `NEXT_PUBLIC_FIREBASE_*` set to the **production** project if the client should use production (Auth, Firestore, etc.).

After that, the dashboard will connect to real Firebase production (same project as in the service account and client config).
