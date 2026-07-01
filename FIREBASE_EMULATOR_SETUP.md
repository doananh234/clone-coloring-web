# Firebase Emulator Setup

This guide explains how to connect the iroly-dashboard to Firebase emulators running on localhost.

## Quick Start

1. **Start Firebase Emulators** (from `firebase-functions` directory):
   ```bash
   cd ../firebase-functions
   yarn serve
   # or
   npm run serve
   ```

2. **Start the Dashboard** (from `iroly-dashboard` directory):
   ```bash
   yarn dev
   # or
   npm run dev
   ```

The dashboard will automatically connect to the emulators when running in development mode.

## Emulator Ports

The emulators run on the following ports (configured in `firebase-functions/firebase.json`):

- **Firestore**: `localhost:8080`
- **Auth**: `localhost:9099`
- **Functions**: `localhost:5001`
- **UI**: `localhost:4000` (Firebase Emulator Suite UI)

## Configuration

### Client-Side (Browser)

The client-side Firebase connection (`src/lib/firebase-client.ts`) automatically connects to emulators when:
- `NODE_ENV === 'development'` (default in dev mode)
- `NEXT_PUBLIC_USE_EMULATOR !== 'false'`

To disable emulators in development, set:
```bash
NEXT_PUBLIC_USE_EMULATOR=false
```

### Server-Side (API Routes)

The server-side Firebase Admin SDK (`src/lib/firebase-admin.ts`) automatically connects to emulators when:
- `NODE_ENV === 'development'` (default in dev mode)
- `USE_EMULATOR !== 'false'`

To disable emulators in development, set:
```bash
USE_EMULATOR=false
```

## Accessing Emulator UI

Once the emulators are running, you can access the Firebase Emulator Suite UI at:
- **http://localhost:4000**

This UI allows you to:
- View and manage Firestore data
- Manage authentication users
- View function logs
- Test your Firebase setup

## Troubleshooting

### Emulators not connecting

1. **Check if emulators are running**:
   ```bash
   # From firebase-functions directory
   yarn serve
   ```

2. **Check console logs**:
   - Client-side: Look for `✅ Connected to Firestore emulator` in browser console
   - Server-side: Look for `✅ Firebase Admin connected to emulators` in server logs

3. **Verify ports are not in use**:
   ```bash
   lsof -i :8080  # Firestore
   lsof -i :9099  # Auth
   lsof -i :5001  # Functions
   ```

### Using Production Instead of Emulators

If you want to use **real Firebase production** (Firestore, Auth, etc.) instead of emulators, see **[FIREBASE_PRODUCTION.md](./FIREBASE_PRODUCTION.md)** for the full steps.

Short version:

1. Set in `.env.development.local` (or when running):
   - `USE_EMULATOR=false`
   - `NEXT_PUBLIC_USE_EMULATOR=false`
2. To use production credentials in dev: `USE_FIREBASE_PRODUCTION=true`
3. Ensure `service-account.production.json` exists and client env uses production project IDs.
4. Run: `yarn dev` (or `yarn build && yarn start` for a production build).

## Notes

- Emulators only connect in development mode by default
- The emulator connection happens automatically - no manual configuration needed
- Data in emulators is ephemeral and will be cleared when emulators stop
- To persist emulator data, use the `--export-on-exit` flag when starting emulators
