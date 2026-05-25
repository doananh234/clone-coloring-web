# AI Agent Quick Reference

> For Claude Code, Copilot, Cursor, and other AI coding agents. Short, scannable, action-oriented. For full details, see [TECHNICAL.md](./TECHNICAL.md). For rules, see [CODEBASE-RULES.md](./CODEBASE-RULES.md).

---

## "I want to add a new CRUD entity"

```bash
# Option A: CLI
yarn vx:add-entity products

# Option B: Manual (6 steps)
```

**Step 1:** Create `apps/admin/src/crud/products.ts`:

```ts
import { createCrudPages } from "@vx/core-uikit/generators";
import type { FieldConfig } from "@vx/core-uikit/generators";
import { appNavigate } from "@/lib/navigate";

export type Product = { id: string; name: string; price: number; category: string };

export const productFields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", sortable: true, filterable: true },
  { name: "price", label: "Price", type: "number", sortable: true },
  {
    name: "category",
    label: "Category",
    type: "select",
    filterable: true,
    options: [
      { label: "Electronics", value: "electronics" },
      { label: "Clothing", value: "clothing" },
    ],
  },
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

**Step 2:** Create locale files (`apps/admin/src/i18n/locales/{en,vi,ja}/products.json`):

```json
{
  "title": "Product Management",
  "fields": { "name": "Product Name", "price": "Price", "category": "Category" },
  "options": { "category": { "electronics": "Electronics", "clothing": "Clothing" } }
}
```

**Step 3:** Register in `apps/admin/src/main.tsx`:

```ts
import enProducts from "./i18n/locales/en/products.json";
import viProducts from "./i18n/locales/vi/products.json";
import jaProducts from "./i18n/locales/ja/products.json";
registerTranslations("en", "products", enProducts);
registerTranslations("vi", "products", viProducts);
registerTranslations("ja", "products", jaProducts);
```

**Step 4:** Create 4 route files in `apps/admin/src/routes/products/`:

```tsx
// index.tsx
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/products/")({
  component: lazyRouteComponent(() =>
    import("@/crud/products").then((m) => ({ default: m.productCrud.ListPage })),
  ),
});

// new.tsx — same pattern, use CreatePage
// $productId.tsx — same pattern, use DetailPage
// $productId_.edit.tsx — same pattern, use EditPage (NOTE: underscore before .edit)
```

**Step 5:** Add nav item in `packages/core-uikit/src/components/layout/app-sidebar.tsx`

**Step 6:** Add mock API in `apps/admin/mock-api.ts`

---

## "I want to add a new module"

Follow `packages/auth-module/` structure exactly:

```
packages/my-module/
├── package.json          # name: "@vx/my-module", exports with subpaths
├── tsconfig.json
└── src/
    ├── components/       # import { Button } from "@vx/core-uikit/components"
    │   ├── my-screen.tsx
    │   └── index.ts
    ├── hooks/
    │   ├── use-my-hook.tsx
    │   └── index.ts
    ├── i18n/
    │   ├── locales/{en,vi,ja}/my-module.json
    │   └── index.ts      # export registerMyModuleTranslations()
    ├── config.ts
    ├── types.ts
    └── index.ts
```

Then wire into app:

1. Add `"@vx/my-module": "workspace:*"` to `apps/admin/package.json`
2. Add `@source "../../../packages/my-module/src/**/*.{ts,tsx}";` in `apps/admin/src/app.css`
3. Call `registerMyModuleTranslations()` in `apps/admin/src/main.tsx`
4. `yarn install`

---

## "I want to add a new component"

```bash
cd packages/core-uikit
npx shadcn@latest add <component-name>
```

Then export from `packages/core-uikit/src/components/index.ts`.

---

## "I want to add a translation"

**For an existing entity** — edit the JSON files in `apps/admin/src/i18n/locales/{en,vi,ja}/{entity}.json`.

**For a new entity** — see "I want to add a new CRUD" above (Step 2-3).

**For a new module** — create `register*Translations()` in `packages/{module}/src/i18n/index.ts`:

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

**Locale file structure:**

```json
{
  "title": "Page Title",
  "fields": { "fieldName": "Label" },
  "options": { "fieldName": { "optionValue": "Label" } }
}
```

---

## "I want to customize a form"

Use `renderField` and `renderFooter` props on `FormBuilder`:

```tsx
<FormBuilder
  fields={formFields}
  schema={schema}
  onSubmit={handleSubmit}
  renderField={(field, { register, setValue, watch, error }) => {
    if (field.name === "avatar") {
      return <AvatarUploader value={watch("avatar")} onChange={(v) => setValue("avatar", v)} />;
    }
    return null; // null = use default rendering for this field
  }}
  renderFooter={({ isLoading }) => (
    <div className="flex gap-2">
      <Button type="submit" disabled={isLoading}>
        Save Draft
      </Button>
      <Button type="submit" variant="default" disabled={isLoading}>
        Publish
      </Button>
    </div>
  )}
/>
```

---

## "I want to add API middleware"

```ts
import { addMiddleware } from "@vx/core-uikit/api";

const unsubscribe = addMiddleware({
  onRequest(ctx) {
    ctx.headers["X-Request-ID"] = crypto.randomUUID();
    return ctx;
  },
  onResponse(ctx) {
    console.log(`[API] ${ctx.status}`);
    return ctx;
  },
  onError(error) {
    errorTracker.capture(error);
  },
});

// Later: unsubscribe() to remove
```

---

## "I want to change the theme"

```ts
import { useTheme } from "@vx/core-uikit/hooks";

const { theme, variant, setTheme, setVariant, resolvedTheme } = useTheme();

setTheme("dark"); // "light" | "dark" | "system"
setVariant("corporate"); // "default" | "corporate" | "minimal"
```

---

## Common Mistakes to Avoid (Top 10)

| #   | Mistake                                            | Fix                                      |
| --- | -------------------------------------------------- | ---------------------------------------- |
| 1   | Using `@/` alias in `core-uikit`                   | Use relative imports (`../`, `../../`)   |
| 2   | Creating UI in `apps/admin/src/components/ui/`     | All UI in `@vx/core-uikit/components`    |
| 3   | Hardcoding user-facing strings                     | Use `t()` with `useTranslation(ns)`      |
| 4   | Adding padding to page components                  | Root layout handles `p-4 md:p-6`         |
| 5   | Edit route named `$param/edit.tsx`                 | Must be `$param_.edit.tsx` (underscore!) |
| 6   | Defining "Save"/"Cancel" in entity locale          | These come from `common` namespace       |
| 7   | Forgetting `@source` in `app.css` for new packages | Tailwind won't scan the package          |
| 8   | Eager importing CRUD pages in routes               | Use `lazyRouteComponent()`               |
| 9   | Missing locale files for vi or ja                  | ALL 3 languages required: en, vi, ja     |
| 10  | Putting feature logic in core-uikit                | Create a separate `packages/` module     |

---

## Import Cheat Sheet

| I need...                                                              | Import from                    |
| ---------------------------------------------------------------------- | ------------------------------ |
| `Button`, `Card`, `Input`, `Select`, `Dialog`                          | `@vx/core-uikit/components`    |
| `DataTable`, `FormBuilder`, `DetailView`, `FilterBar`, `ConfirmDialog` | `@vx/core-uikit/components`    |
| `AppSidebar`, `SiteHeader`, `SidebarProvider`, `Toaster`               | `@vx/core-uikit/components`    |
| `appApi`, `useRestGetAll`, `useRestMutation`                           | `@vx/core-uikit/api`           |
| `httpGet`, `httpPost`, `setAuthToken`, `ApiError`                      | `@vx/core-uikit/api`           |
| `addMiddleware`                                                        | `@vx/core-uikit/api`           |
| `setTokenStorageStrategy`, `setTokenRefreshConfig`                     | `@vx/core-uikit/api`           |
| `QueryProvider`                                                        | `@vx/core-uikit/api`           |
| `createCrudPages`, `FieldConfig`                                       | `@vx/core-uikit/generators`    |
| `useTheme`, `useIsMobile`                                              | `@vx/core-uikit/hooks`         |
| `useLocale`, `useFormattedDate`, `useFormattedNumber`                  | `@vx/core-uikit/i18n`          |
| `I18nProvider`, `registerTranslations`                                 | `@vx/core-uikit/i18n`          |
| `notify`, `notifyError`, `useNotifications`                            | `@vx/core-uikit/notifications` |
| `useUIStore`                                                           | `@vx/core-uikit/store`         |
| `sanitizeHtml`, `maskSensitive`                                        | `@vx/core-uikit/security`      |
| `reportWebVitals`                                                      | `@vx/core-uikit/performance`   |
| `User`, `EntityId`, `ApiErrorType`, `classifyError`                    | `@vx/core-uikit/types`         |
| `cn()`, `interpolatePath()`, `assertNever()`                           | `@vx/core-uikit/utils`         |
| `LoginForm`, `SignupForm`                                              | `@vx/auth-module/components`   |
| `AuthProvider`, `useAuth`                                              | `@vx/auth-module/hooks`        |
| `registerAuthTranslations`                                             | `@vx/auth-module/i18n`         |
| `appNavigate`                                                          | `@/lib/navigate` (app only)    |
| `useTranslation`                                                       | `react-i18next`                |

---

## Key File Paths

| File                                                        | Purpose                                  |
| ----------------------------------------------------------- | ---------------------------------------- |
| `apps/admin/src/main.tsx`                                   | App entry, translation registration      |
| `apps/admin/src/routes/__root.tsx`                          | Root layout (providers, sidebar, header) |
| `apps/admin/src/crud/_template.ts`                          | Template for new CRUD entities           |
| `apps/admin/src/crud/users.ts`                              | Example CRUD config                      |
| `apps/admin/src/lib/navigate.ts`                            | `appNavigate()` for CRUD configs         |
| `apps/admin/mock-api.ts`                                    | Mock API (Vite plugin)                   |
| `apps/admin/src/app.css`                                    | Tailwind config + CSS variables          |
| `packages/core-uikit/src/api/http-client.ts`                | HTTP client + token management           |
| `packages/core-uikit/src/api/middleware.ts`                 | Request/response middleware              |
| `packages/core-uikit/src/generators/create-crud-pages.tsx`  | CRUD page generator                      |
| `packages/core-uikit/src/generators/types.ts`               | FieldConfig, CrudPagesConfig types       |
| `packages/core-uikit/src/components/crud/form-builder.tsx`  | FormBuilder (renderField/renderFooter)   |
| `packages/core-uikit/src/components/layout/app-sidebar.tsx` | Sidebar navigation config                |
| `packages/core-uikit/src/notifications/notify.ts`           | Notification API                         |
| `packages/core-uikit/src/hooks/use-theme.ts`                | Theme hook                               |
| `packages/core-uikit/src/i18n/register.ts`                  | `registerTranslations()`                 |
