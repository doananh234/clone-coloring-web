# Technical Reference

> Full technical reference for VX Admin Theme. For architecture overview, see [ARCHITECTURE.md](../ARCHITECTURE.md). For project rules, see [CLAUDE.md](../CLAUDE.md).

## Package Dependency Graph

```
@vx/admin (app)
├── @vx/core-uikit      workspace:*
├── @vx/auth-module      workspace:*
├── @tanstack/react-router   ^1.0.0
├── @tanstack/react-query    ^5.0.0
├── @tanstack/react-table    ^8.21.3
├── react / react-dom        ^19.0.0
├── recharts                 3.8.0
├── zod                      ^4.4.3
├── sonner                   ^2.0.7
├── vite                     ^6.0.0
└── tailwindcss              ^4.0.0

@vx/core-uikit (shared infra)
├── @tanstack/react-query    ^5.0.0
├── @tanstack/react-table    ^8.0.0
├── @tanstack/react-virtual  ^3.13.24
├── react-hook-form          ^7.54.0
├── @hookform/resolvers      ^5.0.0
├── zod                      ^4
├── zustand                  ^5.0.13
├── i18next                  ^26.1.0
├── react-i18next            ^17.0.7
├── dompurify                ^3.4.2
├── web-vitals               ^5.2.0
├── sonner                   ^2.0.7
├── lucide-react             ^0.400.0
├── radix-ui                 ^1.4.3
└── class-variance-authority ^0.7.0

@vx/auth-module (feature module)
├── @vx/core-uikit           workspace:*
├── i18next                  *
└── react-i18next            *

Tooling:
├── turbo                    ^2.5.0
├── typescript               ^5.8.0
├── prettier                 ^3.8.3
├── husky                    ^9.1.7
├── lint-staged              ^17.0.4
├── @commitlint/cli          ^21.0.0
└── yarn                     4.14.1
```

---

## Subpath Export Reference

### @vx/core-uikit

| Subpath                        | Exports                                                                                                                                                                                                                                                                                             | Source                       |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `@vx/core-uikit/components`    | All UI: shadcn (`ui/*`), CRUD (`crud/*`), layout (`layout/*`)                                                                                                                                                                                                                                       | `src/components/index.ts`    |
| `@vx/core-uikit/api`           | `QueryProvider`, `appApi`, `useRestGetAll`, `useRestGetOne`, `useRestMutation`, `useRestGetAllInfinite`, `addMiddleware`, `httpGet/Post/Put/Patch/Del`, `setAuthToken`, `getAuthToken`, `clearAuthToken`, `setUnauthorizedCallback`, `setTokenRefreshConfig`, `setTokenStorageStrategy`, `ApiError` | `src/api/index.ts`           |
| `@vx/core-uikit/generators`    | `createCrudPages`, `FieldConfig`, `CrudPagesConfig`, `CrudPages`                                                                                                                                                                                                                                    | `src/generators/index.ts`    |
| `@vx/core-uikit/hooks`         | `useLocale`, `useIsMobile`, `useTheme`                                                                                                                                                                                                                                                              | `src/hooks/index.ts`         |
| `@vx/core-uikit/i18n`          | `I18nProvider`, `registerTranslations`, `useLocale`, `useFormattedDate`, `useFormattedNumber`, `i18n`                                                                                                                                                                                               | `src/i18n/index.ts`          |
| `@vx/core-uikit/types`         | `User`, `PaginationMeta`, `PaginatedResponse`, `ListParams`, `SortParam`, `EntityId`, `UserId`, `createId`, `ApiErrorType`, `classifyError`                                                                                                                                                         | `src/types/index.ts`         |
| `@vx/core-uikit/utils`         | `cn()`, `interpolatePath()`, `assertNever()`                                                                                                                                                                                                                                                        | `src/utils/index.ts`         |
| `@vx/core-uikit/config`        | `env` helpers                                                                                                                                                                                                                                                                                       | `src/config/index.ts`        |
| `@vx/core-uikit/notifications` | `notify`, `notifyError`, `useNotifications`, `notificationStore`                                                                                                                                                                                                                                    | `src/notifications/index.ts` |
| `@vx/core-uikit/store`         | `useUIStore` (Zustand)                                                                                                                                                                                                                                                                              | `src/store/index.ts`         |
| `@vx/core-uikit/security`      | `sanitizeHtml`, `maskSensitive`, `deduplicateRequest`                                                                                                                                                                                                                                               | `src/security/index.ts`      |
| `@vx/core-uikit/performance`   | `reportWebVitals`                                                                                                                                                                                                                                                                                   | `src/performance/index.ts`   |

### @vx/auth-module

| Subpath                      | Exports                                          | Source                    |
| ---------------------------- | ------------------------------------------------ | ------------------------- |
| `@vx/auth-module`            | Everything (barrel)                              | `src/index.ts`            |
| `@vx/auth-module/components` | `LoginForm`, `SignupForm`                        | `src/components/index.ts` |
| `@vx/auth-module/hooks`      | `AuthProvider`, `useAuth`                        | `src/hooks/index.ts`      |
| `@vx/auth-module/config`     | `authEndpoints`                                  | `src/config.ts`           |
| `@vx/auth-module/types`      | `LoginCredentials`, `RegisterData`, `AuthTokens` | `src/types.ts`            |
| `@vx/auth-module/i18n`       | `registerAuthTranslations()`                     | `src/i18n/index.ts`       |

---

## HTTP Client Layer

Located in `packages/core-uikit/src/api/`. Four layers:

### Layer 1: `http-client.ts` — Low-level fetch wrapper

```ts
// Token storage strategies
setTokenStorageStrategy("localStorage" | "cookie" | "memory");

// Token management
setAuthToken({ accessToken, refreshToken });
getAuthToken();       // returns AuthTokens | null
clearAuthToken();

// Auto-refresh on 401
setTokenRefreshConfig({ url: "/api/auth/refresh" });
setUnauthorizedCallback(() => router.navigate({ to: "/login" }));

// HTTP methods (all return Promise<T>)
httpGet<T>(url)
httpPost<T>(url, data?)
httpPut<T>(url, data?)
httpPatch<T>(url, data?)
httpDel<T>(url, data?)
```

**Token refresh flow:**

1. Request gets 401 response
2. If `refreshConfig` is set, attempt token refresh via POST to refresh URL
3. Race condition protection: concurrent 401s share a single refresh promise (`isRefreshing` flag)
4. On success: retry original request with `_retry: true` flag
5. On failure: clear tokens, call `unauthorizedCallback`, throw `ApiError(401)`

**GET deduplication:** `httpGet` wraps calls in `deduplicateRequest(url, fn)` — concurrent identical GET URLs share a single in-flight promise.

**ApiError class:**

```ts
class ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;
}
```

### Layer 2: `client.ts` — `appApi` object

```ts
appApi.get<T>(url)                          // single resource
appApi.getAll<T>(url, params?: ListParams)  // paginated list
appApi.post<T>(url, data?)
appApi.put<T>(url, data?)
appApi.patch<T>(url, data?)
appApi.delete<T>(url, data?)
```

`getAll` auto-builds query string from `ListParams`:

```ts
type ListParams = {
  page?: number;
  limit?: number;
  filters?: Record<string, unknown>;
  sort?: SortParam[];
};
```

### Layer 3: `hooks/use-rest-api.ts` — TanStack Query hooks

```ts
// Paginated list with cache keys [entityName, "list", page, limit, filters, sort]
const { data, meta, isLoading, isError, error, refresh } = useRestGetAll<T>({
  entityName: "users",
  url: "/api/users",
  page: 1,
  limit: 20,
  filters: { role: "admin" },
  sort: [{ field: "name", order: "asc" }],
  enabled: true,
});

// Single resource with cache keys [entityName, id]
const { data, isLoading, isError, error, refresh } = useRestGetOne<T>({
  entityName: "users",
  url: "/api/users/:id",
  pathParams: { id: "123" },
  enabled: true,
});

// Mutation with optimistic invalidation
const { mutate, mutateAsync, data, error, isLoading, isSuccess, reset } = useRestMutation<T>({
  entityName: "users",
  url: "/api/users/:id",
  method: "PUT",
  pathParams: { id: "123" },
  notifications: {
    success: (result) => ({ title: "Saved", description: "User updated" }),
    error: (err) => ({ title: "Error", description: err.message }),
  },
});

// Infinite scroll with auto-pagination
const { items, hasMore, loadMore, isLoading, isLoadingMore, refresh } = useRestGetAllInfinite<T>({
  entityName: "users",
  url: "/api/users",
  limit: 20,
  filters: {},
});
```

**Mutation behavior:**

- `onMutate`: cancels in-flight queries for `[entityName]`
- `onSuccess`: invalidates all `[entityName]` queries + shows notification
- `onError`: invalidates + shows error notification via `notifyError()`

### Layer 4: Middleware

```ts
import { addMiddleware } from "@vx/core-uikit/api";

const unsubscribe = addMiddleware({
  onRequest(ctx) {
    // ctx: { url, method, headers, body }
    ctx.headers["X-Custom"] = "value";
    return ctx;
  },
  onResponse(ctx) {
    // ctx: { status, data, headers }
    console.log(`${ctx.status}`);
    return ctx;
  },
  onError(error) {
    analytics.track("api_error", { message: error.message });
  },
});

unsubscribe(); // remove middleware
```

### React Query Config

```ts
// Default settings in QueryProvider (src/api/index.ts)
{
  staleTime: 5 * 60 * 1000,       // 5 minutes
  gcTime: 30 * 60 * 1000,         // 30 minutes garbage collection
  refetchOnWindowFocus: false,
}
```

---

## CRUD Generator

### `createCrudPages<T>(config)` API

```ts
import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig, CrudPagesConfig } from "@vx/core-uikit/generators";
```

**`CrudPagesConfig<T>`:**

| Property      | Type                     | Required | Description                          |
| ------------- | ------------------------ | -------- | ------------------------------------ |
| `entityName`  | `string`                 | Yes      | Cache key prefix, e.g. `"users"`     |
| `basePath`    | `string`                 | Yes      | URL prefix, e.g. `"/users"`          |
| `apiUrl`      | `string`                 | Yes      | API endpoint, e.g. `"/api/users"`    |
| `fields`      | `FieldConfig[]`          | Yes      | Field definitions                    |
| `namespace`   | `string`                 | No       | i18n namespace for label translation |
| `navigate`    | `(path: string) => void` | No       | SPA navigation function              |
| `columns`     | `ColumnDef<T>[]`         | No       | Override auto-generated columns      |
| `formSchema`  | `ZodType`                | No       | Override auto-generated zod schema   |
| `listActions` | `(row: T) => ReactNode`  | No       | Custom action buttons per row        |
| `pageSize`    | `number`                 | No       | Items per page (default: 20)         |

**`FieldConfig`:**

| Property       | Type                 | Required | Description                                                                                                  |
| -------------- | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `name`         | `string`             | Yes      | Field key in data object                                                                                     |
| `label`        | `string`             | Yes      | Fallback label (overridden by i18n)                                                                          |
| `type`         | `FieldType`          | Yes      | `"text"` \| `"email"` \| `"number"` \| `"select"` \| `"textarea"` \| `"date"` \| `"boolean"` \| `"relation"` |
| `options`      | `{ label, value }[]` | No       | For `select`/`relation` types                                                                                |
| `sortable`     | `boolean`            | No       | Enable column sorting                                                                                        |
| `filterable`   | `boolean`            | No       | Show in filter panel                                                                                         |
| `showInList`   | `boolean`            | No       | Show in table (default: true)                                                                                |
| `showInDetail` | `boolean`            | No       | Show in detail view (default: true)                                                                          |
| `showInForm`   | `boolean`            | No       | Show in form (default: true)                                                                                 |
| `validation`   | `ZodType`            | No       | Custom per-field validation                                                                                  |

**Returns:** `{ ListPage, CreatePage, EditPage, DetailPage }` — all `React.FC`.

**Auto-generated features:**

- URL search params sync: `page`, `search`, `sort`, filter fields all persist in URL
- Sort state serialized as JSON in `?sort=` param
- Filter bar with expandable inline panel (smooth slide animation)
- Zod schema auto-built from fields if `formSchema` not provided
- Delete confirmation dialog
- Back/Cancel uses `history.back()`

---

## Notification System

### `notify` API

```ts
import { notify, notifyError } from "@vx/core-uikit/notifications";

// Toast + bell store
notify.success("User created");
notify.error("errors:networkError"); // auto-translates i18n keys containing ":"
notify.info("Check your email");
notify.warning("Session expiring");

// Options
notify.success("Saved", {
  description: "User profile updated",
  descriptionKey: "common:savedDescription", // i18n key for description
  silent: true, // toast only, skip bell store
});

// Promise-based toast
notify.promise(fetchData(), {
  loading: "Loading...",
  success: "Done",
  error: "Failed",
});

notify.dismiss(toastId);
```

### `notifyError(error)` — Auto-maps HTTP status codes

```ts
try {
  await appApi.post("/api/users", data);
} catch (err) {
  notifyError(err);
}
// 400 → "errors:badRequest", 401 → "errors:unauthorized", etc.
```

### Notification Store

```ts
import { notificationStore, useNotifications } from "@vx/core-uikit/notifications";

// React hook
const { notifications, unreadCount, markAsRead, markAllAsRead, remove, clear } = useNotifications();

// Direct store access (outside React)
notificationStore.getAll();
notificationStore.getUnreadCount();
notificationStore.add({ type: "info", title: "Hello" });
notificationStore.markAsRead(id);
notificationStore.subscribe(() => console.log("changed"));
```

Store keeps max 50 notifications. Each item has: `id`, `type`, `title`, `description?`, `read`, `createdAt`.

### Bell Component

`packages/core-uikit/src/components/layout/notification-bell.tsx` — renders in `SiteHeader`, shows unread count badge, dropdown with notification list.

---

## i18n System

### Setup

```tsx
// apps/admin/src/main.tsx
import { I18nProvider, registerTranslations } from "@vx/core-uikit/i18n";

registerTranslations("en", "users", enUsers);
registerTranslations("vi", "users", viUsers);

<I18nProvider defaultLocale="en">
  <App />
</I18nProvider>;
```

### Module Registration Pattern

```ts
// packages/auth-module/src/i18n/index.ts
import { registerTranslations } from "@vx/core-uikit/i18n";
import en from "./locales/en/auth.json";
import vi from "./locales/vi/auth.json";
import ja from "./locales/ja/auth.json";

export function registerAuthTranslations(): void {
  registerTranslations("en", "auth", en);
  registerTranslations("vi", "auth", vi);
  registerTranslations("ja", "auth", ja);
}
```

### Locale File Structure

```
apps/admin/src/i18n/locales/
├── en/
│   ├── users.json       # { "title": "...", "fields": {...}, "options": {...} }
│   └── dashboard.json
├── vi/
│   ├── users.json
│   └── dashboard.json
└── ja/
    ├── users.json
    └── dashboard.json
```

Common namespaces (`common`, `errors`, `forms`) are in `packages/core-uikit/src/i18n/locales/`.

### Formatting Hooks

```ts
import { useFormattedDate } from "@vx/core-uikit/i18n";
const { formatDate, formatDateTime, formatRelative } = useFormattedDate();

formatDate(new Date(), "medium"); // "May 11, 2026" (en) / "11 thg 5, 2026" (vi)
formatDateTime(new Date()); // "May 11, 2026, 3:30 PM"
formatRelative(pastDate); // "2 hours ago" / "2 gio truoc"

import { useFormattedNumber } from "@vx/core-uikit/i18n";
const { formatNumber, formatCurrency, formatPercent, formatCompact } = useFormattedNumber();

formatNumber(1234.5); // "1,234.5"
formatCurrency(99.99, "USD"); // "$99.99"
formatPercent(0.156, 1); // "15.6%"
formatCompact(1500000); // "1.5M"
```

### `useLocale()` Hook

```ts
import { useLocale } from "@vx/core-uikit/i18n";
const { locale, setLocale, supportedLocales } = useLocale();
// supportedLocales: [{ code: "en", label: "English" }, { code: "vi", label: "Tieng Viet" }, { code: "ja", label: "Japanese" }]
await setLocale("vi");
```

---

## Theme System

```ts
import { useTheme } from "@vx/core-uikit/hooks";

const { theme, variant, setTheme, setVariant, resolvedTheme } = useTheme();

// theme: "light" | "dark" | "system"
// variant: "default" | "corporate" | "minimal"
// resolvedTheme: "light" | "dark" (actual applied theme)

setTheme("dark");
setVariant("corporate");
```

- Persisted to `localStorage` under key `vx_theme`
- System theme tracks `prefers-color-scheme` media query
- Applies `dark` class to `<html>` for dark mode
- Applies `theme-corporate` / `theme-minimal` class for variants
- CSS variables defined in `apps/admin/src/app.css`

---

## State Management

### Zustand UI Store

```ts
import { useUIStore } from "@vx/core-uikit/store";

const { sidebarCollapsed, toggleSidebar, setSidebarCollapsed } = useUIStore();
```

Persisted to `localStorage` under key `vx_ui`.

### React Query — see [HTTP Client Layer](#layer-3-hooksuse-rest-apits--tanstack-query-hooks)

### URL Search Params Sync

CRUD generator auto-syncs to URL: `page`, `search`, `sort`, and filter field values. Uses `window.history.replaceState` (no full navigation). State survives page reload.

---

## Security

### HTML Sanitization

```ts
import { sanitizeHtml } from "@vx/core-uikit/security";
const clean = sanitizeHtml(userInput); // DOMPurify
```

### Sensitive Data Masking

```ts
import { maskSensitive } from "@vx/core-uikit/security";
maskSensitive("sk_live_abc123"); // "sk_***********"
```

### GET Request Deduplication

```ts
import { deduplicateRequest } from "@vx/core-uikit/security";
// Concurrent calls to same key share one in-flight promise
const result = await deduplicateRequest("key", () => fetch(url));
```

Automatically used by `httpGet` — no manual usage needed for standard API calls.

### Token Storage Strategies

```ts
import { setTokenStorageStrategy } from "@vx/core-uikit/api";
setTokenStorageStrategy("localStorage"); // default
setTokenStorageStrategy("cookie"); // httpOnly-like, SameSite=Strict, Secure
setTokenStorageStrategy("memory"); // lost on page refresh
```

---

## Performance

### Web Vitals

```ts
import { reportWebVitals } from "@vx/core-uikit/performance";

// Default: logs to console in dev mode
reportWebVitals();

// Custom reporter
reportWebVitals((metric) => {
  analytics.send({ name: metric.name, value: metric.value });
});
```

Tracks: CLS, FID, LCP, FCP, TTFB.

### Memoization

- `DataTable` — `React.memo` wrapper
- `FormBuilder` — `React.memo` wrapper

### Virtualization

`DataTable` uses `@tanstack/react-virtual` for efficient rendering of 1000+ rows.

### Bundle Analyzer

```bash
yarn build  # generates dist/bundle-stats.html
```

Uses `rollup-plugin-visualizer`.

---

## Type System

### Branded IDs

```ts
import type { EntityId, UserId } from "@vx/core-uikit/types";
import { createId } from "@vx/core-uikit/types";

type ProductId = EntityId<"Product">;
const id = createId<"Product">("abc-123");
// Prevents: userId = productId (type error)
```

### API Error Classification

```ts
import type { ApiErrorType } from "@vx/core-uikit/types";
import { classifyError } from "@vx/core-uikit/types";

const errType: ApiErrorType = classifyError(404); // "NotFound"
// Types: "NetworkError" | "BadRequest" | "Unauthorized" | "Forbidden" |
//        "NotFound" | "Conflict" | "TooManyRequests" | "ServerError" |
//        "Timeout" | "Unknown"
```

### Exhaustive Checking

```ts
import { assertNever } from "@vx/core-uikit/utils";

switch (status) {
  case "active":
    return "green";
  case "inactive":
    return "gray";
  default:
    assertNever(status); // compile error if case missed
}
```
