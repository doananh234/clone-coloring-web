# VX Admin Theme — Project Guide

## Overview

Monorepo admin dashboard template built with Yarn 4 workspaces + Turborepo. Uses shadcn/ui, TanStack Router (file-based), TanStack Query, and a modular package architecture.

## Quick Start

```bash
yarn install
yarn dev --filter=@vx/admin   # Start admin app at http://localhost:5173
```

## Architecture

```
new-admin-theme/
├── packages/
│   ├── core-uikit/          # @vx/core-uikit — shared UI, API, generators, i18n, hooks
│   └── auth-module/         # @vx/auth-module — auth feature (LoginForm, SignupForm)
├── apps/
│   └── admin/               # @vx/admin — thin app layer (routes, configs, translations)
└── tooling/                 # Shared tsconfig, eslint, tailwind configs
```

### Package Responsibilities

| Package | Scope | Contains |
|---|---|---|
| `@vx/core-uikit` | Shared infrastructure | UI components, API layer, CRUD generator, i18n (common/errors/forms), hooks (useLocale), types, utils |
| `@vx/auth-module` | Auth feature | LoginForm, SignupForm, AuthProvider, useAuth, auth types, auth config, auth i18n |
| `@vx/admin` | App layer | Routes, CRUD configs, entity translations, mock API |
| Future: `@vx/billing-module` | Feature module | Screens, hooks, types, config, i18n (same pattern as auth-module) |

### Core-uikit Structure

```
packages/core-uikit/src/
├── components/
│   ├── ui/              # shadcn base components (Button, Card, Input, Sidebar, etc.)
│   ├── crud/            # CRUD building blocks (DataTable, FormBuilder, DetailView, FilterBar, ConfirmDialog)
│   └── layout/          # App layout (AppSidebar, SiteHeader, NavMain, NavUser, SectionCards, etc.)
├── generators/          # createCrudPages() — generates full CRUD from config
├── api/                 # HTTP client (Layer 1), appApi (Layer 2), TanStack Query hooks (Layer 3)
├── hooks/               # AuthProvider, useAuth, useLocale, useIsMobile
├── i18n/                # I18nProvider, registerTranslations, locale files (en/vi/ja)
├── config/              # Endpoints, env helpers
├── types/               # User, PaginationMeta, ListParams, SortParam, etc.
└── utils/               # cn(), interpolatePath()
```

### Feature Module Structure (e.g. auth-module)

```
packages/auth-module/src/
├── components/          # UI components (LoginForm, SignupForm)
│   ├── login-form.tsx   # Imports UI from @vx/core-uikit/components
│   ├── signup-form.tsx
│   └── index.ts
├── hooks/               # Module-specific hooks (AuthProvider, useAuth)
│   ├── use-auth.tsx
│   └── index.ts
├── i18n/                # Module-specific translations
│   ├── locales/en/auth.json
│   ├── locales/vi/auth.json
│   ├── locales/ja/auth.json
│   └── index.ts         # registerAuthTranslations() helper
├── config.ts            # Module endpoints (authEndpoints)
├── types.ts             # Module types (LoginCredentials, RegisterData, AuthTokens)
└── index.ts             # Root barrel export
```

**Each feature module owns ALL its own concerns:**
- **Components** — UI screens/forms
- **Hooks** — State management, context providers
- **i18n** — Translations with a `register*Translations()` helper
- **Config** — API endpoints
- **Types** — Domain types

Feature modules import shared infra from `@vx/core-uikit`:
- UI primitives from `@vx/core-uikit/components`
- HTTP/token functions from `@vx/core-uikit/api`
- Shared types (e.g. `User`) from `@vx/core-uikit/types`
- Utilities from `@vx/core-uikit/utils`
- i18n registration from `@vx/core-uikit/i18n`

### Admin App Structure (thin layer)

```
apps/admin/src/
├── crud/                    # One config file per entity (e.g. users.ts, _template.ts)
├── routes/                  # TanStack file-based routes (one-liners for CRUD)
├── i18n/locales/            # App-specific translations per entity (en/vi/ja)
├── lib/
│   └── navigate.ts          # appNavigate() — SPA navigation helper for CRUD configs
├── components/
│   └── data-table.tsx       # Dashboard-specific data table (from shadcn dashboard-01)
├── app/dashboard/data.json  # Dashboard sample data
├── mocks/                   # Mock data for dev
├── mock-api.ts              # Vite plugin for mock API
└── main.tsx                 # Entry point with I18nProvider + translation registration
```

## Subpath Exports

### @vx/core-uikit

| Import | Contents |
|---|---|
| `@vx/core-uikit/components` | All UI: shadcn base (`ui/`), CRUD (`crud/`), layout (`layout/`) |
| `@vx/core-uikit/api` | QueryProvider, appApi, useRestGetAll, useRestGetOne, useRestMutation, addMiddleware |
| `@vx/core-uikit/generators` | createCrudPages, FieldConfig types |
| `@vx/core-uikit/hooks` | useLocale, useIsMobile, useTheme |
| `@vx/core-uikit/i18n` | I18nProvider, registerTranslations, useLocale, useFormattedDate, useFormattedNumber |
| `@vx/core-uikit/types` | User, PaginationMeta, ListParams, EntityId, UserId, ApiErrorType, classifyError |
| `@vx/core-uikit/utils` | cn(), interpolatePath(), assertNever() |
| `@vx/core-uikit/config` | env helpers |
| `@vx/core-uikit/notifications` | notify, notifyError, useNotifications, notificationStore |
| `@vx/core-uikit/store` | useUIStore (Zustand-based UI preferences) |
| `@vx/core-uikit/security` | sanitizeHtml, maskSensitive, deduplicateRequest |
| `@vx/core-uikit/performance` | reportWebVitals |

### @vx/auth-module

| Import | Contents |
|---|---|
| `@vx/auth-module` | LoginForm, SignupForm, AuthProvider, useAuth, authEndpoints, types, registerAuthTranslations |
| `@vx/auth-module/components` | LoginForm, SignupForm |
| `@vx/auth-module/hooks` | AuthProvider, useAuth |
| `@vx/auth-module/config` | authEndpoints |
| `@vx/auth-module/types` | LoginCredentials, RegisterData, AuthTokens |
| `@vx/auth-module/i18n` | registerAuthTranslations() |

## API Layer (4 layers)

1. `http-client.ts` — fetch wrapper, JWT token storage (localStorage), auto-refresh on 401
2. `client.ts` — `appApi.get/getAll/post/put/patch/delete` with query params builder
3. `hooks/use-rest-api.ts` — Generic TanStack Query hooks
4. App-level: `createCrudPages` config (no manual hooks needed for standard CRUD)

## CRUD Generator

`createCrudPages<T>(config)` returns `{ ListPage, CreatePage, EditPage, DetailPage }`.

Features included automatically:
- Paginated data table with sortable columns (sort icons show asc/desc state)
- Search bar + expandable inline filter panel (smooth slide animation)
- URL search params sync (page, search, sort, filters persist on reload)
- Create/Edit forms with zod validation
- Detail view
- Delete with confirmation dialog
- i18n for all labels (field names, options, actions via `namespace` config)
- Back/Cancel uses `history.back()`

## How to Add a New CRUD Entity

See `apps/admin/src/crud/_template.ts` for full documentation.

### Step 1: Create config — `src/crud/products.ts`

```ts
import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type Product = { id: string; name: string; price: number; category: string };

export const productFields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", sortable: true, filterable: true },
  { name: "price", label: "Price", type: "number", sortable: true },
  { name: "category", label: "Category", type: "select", filterable: true,
    options: [{ label: "Electronics", value: "electronics" }, { label: "Clothing", value: "clothing" }] },
];

export const productCrud = createCrudPages<Product>({
  entityName: "products",
  basePath: "/products",
  apiUrl: "/api/products",
  fields: productFields,
  namespace: "products",
  navigate: appNavigate,
});
```

### Step 2: Create locale files (en/vi/ja)

`src/i18n/locales/en/products.json`:
```json
{
  "title": "Product Management",
  "fields": { "name": "Product Name", "price": "Price", "category": "Category" },
  "options": { "category": { "electronics": "Electronics", "clothing": "Clothing" } }
}
```

### Step 3: Register translations in `src/main.tsx`

```ts
import enProducts from "./i18n/locales/en/products.json";
import viProducts from "./i18n/locales/vi/products.json";
import jaProducts from "./i18n/locales/ja/products.json";
registerTranslations("en", "products", enProducts);
registerTranslations("vi", "products", viProducts);
registerTranslations("ja", "products", jaProducts);
```

### Step 4: Create 4 route files (each is 5 lines)

```
src/routes/products/index.tsx         → component: productCrud.ListPage
src/routes/products/new.tsx           → component: productCrud.CreatePage
src/routes/products/$productId.tsx    → component: productCrud.DetailPage
src/routes/products/$productId_.edit.tsx → component: productCrud.EditPage
```

Example route file:
```tsx
import { createFileRoute } from "@tanstack/react-router";
import { productCrud } from "@/crud/products";
export const Route = createFileRoute("/products/")({
  component: productCrud.ListPage,
});
```

### Step 5: Add to sidebar

Edit nav data in `packages/core-uikit/src/components/layout/app-sidebar.tsx`.

### Step 6: Add mock API (for dev)

Add endpoint handlers in `apps/admin/mock-api.ts`.

## How to Add a New Feature Module

Follow the `@vx/auth-module` pattern:

### Step 1: Create package structure

```
packages/my-module/
├── package.json
├── tsconfig.json
└── src/
    ├── components/           # Feature UI
    │   ├── my-screen.tsx     # import { Button } from "@vx/core-uikit/components"
    │   └── index.ts
    ├── hooks/                # Feature hooks/providers
    │   ├── use-my-hook.tsx
    │   └── index.ts
    ├── i18n/                 # Feature translations
    │   ├── locales/en/my-module.json
    │   ├── locales/vi/my-module.json
    │   ├── locales/ja/my-module.json
    │   └── index.ts          # registerMyModuleTranslations()
    ├── config.ts             # Feature endpoints
    ├── types.ts              # Feature types
    └── index.ts              # Root barrel export
```

### Step 2: package.json

```json
{
  "name": "@vx/my-module",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./components": "./src/components/index.ts",
    "./hooks": "./src/hooks/index.ts",
    "./config": "./src/config.ts",
    "./types": "./src/types.ts",
    "./i18n": "./src/i18n/index.ts"
  },
  "dependencies": {
    "@vx/core-uikit": "workspace:*",
    "i18next": "*",
    "react-i18next": "*"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### Step 3: i18n — create `src/i18n/index.ts`

```ts
import { registerTranslations } from "@vx/core-uikit/i18n";
import en from "./locales/en/my-module.json";
import vi from "./locales/vi/my-module.json";
import ja from "./locales/ja/my-module.json";

export function registerMyModuleTranslations(): void {
  registerTranslations("en", "my-module", en);
  registerTranslations("vi", "my-module", vi);
  registerTranslations("ja", "my-module", ja);
}
```

### Step 4: Add to app

1. Add `"@vx/my-module": "workspace:*"` to the app's `package.json`
2. Add `@source` in `app.css`: `@source "../../../packages/my-module/src/**/*.{ts,tsx}";`
3. Call `registerMyModuleTranslations()` in `main.tsx`
4. Import: `import { MyComponent } from "@vx/my-module/components";`

## i18n

**Locales:** English (en), Vietnamese (vi), Japanese (ja)
**Common namespaces (core-uikit):** `common`, `errors`, `forms`, `auth`
**App namespaces:** one per entity (e.g. `users`, `dashboard`)

Locale file structure per entity:
```json
{
  "title": "Page Title",
  "fields": { "fieldName": "Translated Label" },
  "options": { "fieldName": { "optionValue": "Translated Option" } }
}
```

Action labels (Save, Cancel, Delete, Create, Edit, Search, Loading) come from `common` namespace — no need to define per entity.

## Routing

TanStack Router with file-based routing in `apps/admin/src/routes/`.

- `__root.tsx` — Root layout: QueryProvider > AuthProvider > TooltipProvider > SidebarProvider + AppSidebar + SiteHeader + content area
- Public routes (`/login`, `/register`) render without sidebar
- Content padding handled by root layout (`p-4 md:p-6`)
- Edit routes use `$param_.edit.tsx` (underscore suffix) to prevent nesting

## Styling

- Tailwind CSS v4 with `@tailwindcss/vite` plugin
- All shadcn components in `packages/core-uikit/src/components/ui/`
- CSS variables defined in `apps/admin/src/app.css`
- Each package source scanned via `@source` directive in app.css
- To add new shadcn components: `cd packages/core-uikit && npx shadcn@latest add <name>`, then export from `components/index.ts`

## Testing

```bash
cd packages/core-uikit && yarn test   # 38 tests (Vitest + jsdom)
```

Covers: http-client, appApi, REST hooks, CRUD generator, notification system, useTheme, interpolatePath, buildSchemaFromFields.

Tests are co-located next to source files (e.g. `src/api/http-client.test.ts` next to `src/api/http-client.ts`).

## Dev Server

- Mock API in `apps/admin/mock-api.ts` (Vite plugin)
- Handles user CRUD + auth endpoints with mock data
- `VITE_API_BASE_URL` in `.env` should be empty for dev (uses same origin)

## Rules

### Package Structure
1. **ALL UI components in `@vx/core-uikit`** — apps never maintain their own `components/ui/`
2. **Feature modules are separate packages** — `@vx/auth-module`, `@vx/billing-module`, etc. Not in core-uikit.
3. **Feature modules import UI from core-uikit** — `import { Button } from "@vx/core-uikit/components"`
4. **Core-uikit uses relative imports** (not `@/` alias) — alias doesn't resolve when consumed by apps
5. **New shadcn components go in core-uikit** — `cd packages/core-uikit && npx shadcn@latest add <name>`, then export from `components/index.ts`
6. **Add `@source` directive** in app.css for each new package so Tailwind scans it

### Component Organization
7. **`components/ui/`** — shadcn base components only
8. **`components/crud/`** — CRUD building blocks (DataTable, FormBuilder, DetailView, FilterBar, ConfirmDialog)
9. **`components/layout/`** — App shell (AppSidebar, SiteHeader, nav components, dashboard cards/charts)

### CRUD & Routing
10. **One CRUD config per entity** in app's `src/crud/` — route files are one-liners
11. **Use `$param_.action.tsx` naming** for edit routes to prevent nesting under detail route
12. **Use `history.back()` for back/cancel** — not hardcoded URLs
13. **Don't add padding to page components** — root layout handles `p-4 md:p-6`

### i18n
14. **All user-facing strings must use i18n** — `useTranslation("namespace")`
15. **CRUD i18n uses `namespace` config** — field labels from `fields.*`, options from `options.*`, title from `title`
16. **Common action labels** (Save, Cancel, Delete, etc.) come from `common` namespace — never redefine per entity

### Adding New Packages
17. When creating a new feature module, follow `@vx/auth-module` pattern exactly
18. Add `"@vx/new-module": "workspace:*"` to the consuming app's dependencies
19. Add `@source` path in the app's CSS for Tailwind scanning
20. Create locale files if the module has user-facing strings

### CLI & Tooling
21. **Use `yarn vx:add-entity <name>`** to scaffold new CRUD entities — generates config, routes, and locale files automatically
22. **Token storage is configurable** — call `setTokenStorageStrategy("cookie" | "memory" | "localStorage")` before auth init
23. **Theme toggle** — `useTheme()` hook provides `theme`, `setTheme`, `resolvedTheme`. Sun/Moon toggle is in site header.
24. **DataTable is virtualized** — handles 1000+ rows efficiently via `@tanstack/react-virtual`

### Type Safety
25. **Use branded IDs** (`EntityId<"User">`) for type-safe entity references — prevents mixing IDs
26. **Use `assertNever()`** in switch defaults for exhaustive type checking
27. **Use `classifyError(status)`** to map HTTP status codes to typed `ApiErrorType`

### Code Quality
28. **Tests co-located** — `foo.test.ts` sits next to `foo.ts`, not in separate `__tests__/` folder
29. **React Query DevTools** — auto-enabled in dev mode, panel at bottom-right
30. **Lazy load CRUD routes** — use `lazyRouteComponent(() => import(...))` for code splitting
31. **Zustand for UI state** — `useUIStore()` for sidebar collapse, persisted to localStorage
32. **Optimistic mutations** — `useRestMutation` cancels in-flight queries on mutate, rollback on error

### Security
33. **Sanitize user HTML** — use `sanitizeHtml()` from `@vx/core-uikit/security` before `dangerouslySetInnerHTML`
34. **Mask sensitive data** — use `maskSensitive()` when logging tokens or passwords
35. **GET deduplication** — `httpGet` auto-deduplicates concurrent identical requests

### Flexibility
36. **API middleware** — `addMiddleware({ onRequest, onResponse, onError })` for logging, analytics, custom headers
37. **FormBuilder is extensible** — `renderField` and `renderFooter` props for custom layouts

### Performance
38. **Web Vitals** — `reportWebVitals()` called at startup, logs CLS/FID/LCP/FCP/TTFB in dev
39. **Bundle analyzer** — `yarn build` generates `dist/bundle-stats.html`
40. **React.memo** — DataTable and FormBuilder are memoized to prevent unnecessary re-renders

### i18n Formatting
41. **`useFormattedDate()`** — locale-aware `formatDate()`, `formatDateTime()`, `formatRelative()` via Intl API
42. **`useFormattedNumber()`** — locale-aware `formatNumber()`, `formatCurrency()`, `formatPercent()`, `formatCompact()`

### Theming
43. **Theme variants** — `useTheme()` returns `variant` + `setVariant("corporate" | "minimal" | "default")`
44. **Storybook** — `cd packages/core-uikit && yarn storybook` for component docs at :6006
