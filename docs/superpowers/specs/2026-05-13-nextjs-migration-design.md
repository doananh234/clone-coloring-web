# Phase 1: Convert Admin App to Next.js — Design Spec

**Date:** 2026-05-13
**Status:** Approved
**Scope:** Convert apps/admin from Vite+TanStack Router to Next.js 15 App Router

---

## 1. Overview

Replace Vite + TanStack Router with Next.js 15 App Router in the admin app. All existing page components, shared packages (@vx/core-uikit, @vx/auth-module), Firebase client SDK, and i18n stay unchanged. Routing, layout structure, env vars, and build tooling change.

---

## 2. What Changes

| Layer      | Before                          | After                                       |
| ---------- | ------------------------------- | ------------------------------------------- |
| Framework  | Vite + @vitejs/plugin-react     | Next.js 15 (App Router)                     |
| Routing    | TanStack Router (file-based)    | Next.js App Router (app/)                   |
| Auth UI    | AuthProvider (client-side)      | Same, unchanged                             |
| API routes | mock-api.ts Vite plugin         | Next.js app/api/ routes                     |
| Firebase   | Client SDK via FirebaseProvider | Client SDK (same) + Admin SDK in API routes |
| CSS        | Tailwind v4 + @tailwindcss/vite | Tailwind v4 + @tailwindcss/postcss          |
| Build      | vite build                      | next build                                  |
| Dev        | vite dev :5173                  | next dev :3000                              |
| Env vars   | VITE\_\* (import.meta.env)      | NEXT*PUBLIC*\* (process.env)                |

## 3. What Stays the Same

- @vx/core-uikit package — untouched
- @vx/auth-module package — untouched
- All custom page components (book-detail-page, category-detail-page, etc.)
- All shared components (DetailCard, ImageGrid, ImageLightbox, etc.)
- Firebase Client SDK config and hooks
- i18n setup (react-i18next, client-side)
- All Tailwind classes and styles

---

## 4. Route Mapping

### Route Groups

- `(public)` — login, register, forgot-password. No sidebar.
- `(dashboard)` — all authenticated routes. Sidebar + header layout.

### Routes

| Current (TanStack)                       | Next.js App Router                                    |
| ---------------------------------------- | ----------------------------------------------------- |
| routes/\_\_root.tsx                      | app/layout.tsx (root providers)                       |
| routes/index.tsx                         | app/(dashboard)/page.tsx                              |
| routes/login.tsx                         | app/(public)/login/page.tsx                           |
| routes/register.tsx                      | app/(public)/register/page.tsx                        |
| routes/books/index.tsx                   | app/(dashboard)/books/page.tsx                        |
| routes/books/new.tsx                     | app/(dashboard)/books/new/page.tsx                    |
| routes/books/$bookId.tsx                 | app/(dashboard)/books/[bookId]/page.tsx               |
| routes/books/$bookId\_.edit.tsx          | app/(dashboard)/books/[bookId]/edit/page.tsx          |
| routes/categories/index.tsx              | app/(dashboard)/categories/page.tsx                   |
| routes/categories/new.tsx                | app/(dashboard)/categories/new/page.tsx               |
| routes/categories/$categoryId.tsx        | app/(dashboard)/categories/[categoryId]/page.tsx      |
| routes/categories/$categoryId\_.edit.tsx | app/(dashboard)/categories/[categoryId]/edit/page.tsx |
| routes/app-home/index.tsx                | app/(dashboard)/app-home/page.tsx                     |
| routes/wallets/index.tsx                 | app/(dashboard)/wallets/page.tsx                      |
| routes/wallets/new.tsx                   | app/(dashboard)/wallets/new/page.tsx                  |
| routes/wallets/$walletId.tsx             | app/(dashboard)/wallets/[walletId]/page.tsx           |
| routes/wallets/$walletId\_.edit.tsx      | app/(dashboard)/wallets/[walletId]/edit/page.tsx      |
| routes/credit-ledger/index.tsx           | app/(dashboard)/credit-ledger/page.tsx                |
| routes/users\_/$userId/purchases.tsx     | app/(dashboard)/users/[userId]/purchases/page.tsx     |

---

## 5. Layout Structure

### app/layout.tsx (Root)

- `<html>` + `<body>`
- I18nProvider (client-side)
- No sidebar here

### app/(public)/layout.tsx

- Minimal layout, no sidebar
- Renders children directly

### app/(dashboard)/layout.tsx

- FirebaseProvider
- QueryProvider
- AuthProvider
- TooltipProvider
- SidebarProvider + AppSidebar + SiteHeader
- Auth check: redirect to /login if not authenticated
- Toaster + ReactQueryDevtools

---

## 6. API Routes

Move mock-api.ts endpoints to Next.js API routes:

| Endpoint                      | File                           |
| ----------------------------- | ------------------------------ |
| POST /api/auth/login          | app/api/auth/login/route.ts    |
| POST /api/auth/register       | app/api/auth/register/route.ts |
| GET /api/auth/me              | app/api/auth/me/route.ts       |
| POST /api/auth/refresh        | app/api/auth/refresh/route.ts  |
| GET/POST /api/users           | app/api/users/route.ts         |
| GET/PUT/DELETE /api/users/:id | app/api/users/[id]/route.ts    |

These stay as mock responses for now. Phase 2 will add real API routes for R2, PDF, AI.

---

## 7. Technical Changes

### Environment variables

- `VITE_FIREBASE_API_KEY` → `NEXT_PUBLIC_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN` → `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID` → `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET` → `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID` → `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID` → `NEXT_PUBLIC_FIREBASE_APP_ID`
- `VITE_R2_PUBLIC_BASE_URL` → `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`
- `VITE_API_BASE_URL` → removed (API routes are same-origin)

### "use client" directive

All page components use hooks/state/Firebase client SDK, so all page.tsx files need `"use client"` at top, or wrap content in a client component.

### Navigation

- Replace `appNavigate()` (pushState + popstate) with Next.js `useRouter().push()`
- Replace `window.history.back()` with `useRouter().back()`
- Replace `<a href>` sidebar links with Next.js `<Link>` (optional, href works fine)

### Package changes (apps/admin)

Remove: `@tanstack/react-router`, `@tanstack/router-plugin`, `@tanstack/router-devtools`, `@vitejs/plugin-react`, `vite`, `@tailwindcss/vite`, `rollup-plugin-visualizer`
Add: `next`, `@tailwindcss/postcss`
Keep: `firebase`, `@tanstack/react-query`, `@tanstack/react-query-devtools`, `@tanstack/react-table`, all UI deps

### Config files

- Remove: `vite.config.ts`, `mock-api.ts` (logic moves to API routes)
- Add: `next.config.ts`, `postcss.config.mjs`
- Update: `tsconfig.json` (Next.js paths), `package.json` (scripts)

### next.config.ts

```typescript
const nextConfig = {
  transpilePackages: ["@vx/core-uikit", "@vx/auth-module"],
};
export default nextConfig;
```

---

## 8. Files to Remove After Migration

- `apps/admin/vite.config.ts`
- `apps/admin/mock-api.ts`
- `apps/admin/src/routeTree.gen.ts`
- `apps/admin/src/routes/` (entire directory)
- `apps/admin/src/lib/navigate.ts`
- `apps/admin/index.html`
- `apps/admin/src/main.tsx`
- `apps/admin/src/app.css` → moves to `app/globals.css`

---

## 9. Migration Order

1. Install Next.js, create config files
2. Create app/layout.tsx (root) with providers
3. Create app/(public)/layout.tsx + login/register pages
4. Create app/(dashboard)/layout.tsx with sidebar+auth
5. Migrate all page routes (one by one, wrapping existing components)
6. Move mock-api.ts to API routes
7. Update env vars (VITE* → NEXT_PUBLIC*)
8. Update navigation (appNavigate → useRouter)
9. Update firebase-config.ts to use process.env
10. Remove Vite config, TanStack Router, old routes
11. Verify all pages work
