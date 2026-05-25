# Codebase Rules

> Strict rules for AI agents and developers. No explanations — just rules. For rationale, see [CLAUDE.md](../CLAUDE.md).

---

## Import Rules

**DO:**

```ts
// Feature module imports UI from core-uikit
import { Button, Card } from "@vx/core-uikit/components";
import { appApi, useRestGetAll } from "@vx/core-uikit/api";
import { createCrudPages } from "@vx/core-uikit/generators";
import { notify } from "@vx/core-uikit/notifications";
import type { User, EntityId } from "@vx/core-uikit/types";
import { cn } from "@vx/core-uikit/utils";

// Inside core-uikit: use relative imports
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";

// App uses @/ alias
import { appNavigate } from "@/lib/navigate";
import { userCrud } from "@/crud/users";
```

**DON'T:**

```ts
// NEVER use @/ alias inside core-uikit (breaks when consumed by apps)
import { Button } from "@/components/ui/button"; // WRONG in core-uikit

// NEVER import from deep internal paths
import { Button } from "@vx/core-uikit/src/components/ui/button"; // WRONG

// NEVER import core-uikit components in app's components/ui/
// Apps should not have their own components/ui/ folder
```

---

## File Placement Rules

| What                        | Where                                               |
| --------------------------- | --------------------------------------------------- |
| shadcn UI components        | `packages/core-uikit/src/components/ui/`            |
| CRUD building blocks        | `packages/core-uikit/src/components/crud/`          |
| Layout components           | `packages/core-uikit/src/components/layout/`        |
| Shared hooks                | `packages/core-uikit/src/hooks/`                    |
| Entity CRUD configs         | `apps/admin/src/crud/`                              |
| Route files                 | `apps/admin/src/routes/`                            |
| App translations            | `apps/admin/src/i18n/locales/{lang}/`               |
| Feature module translations | `packages/{module}/src/i18n/locales/{lang}/`        |
| Tests                       | Next to source file (`foo.test.ts` beside `foo.ts`) |
| Feature modules             | `packages/{module-name}/` (never inside core-uikit) |

**DON'T:**

- Put UI components in `apps/admin/src/components/ui/` — use `@vx/core-uikit/components`
- Put tests in `__tests__/` directories — co-locate with source
- Put feature logic in `core-uikit` — create a separate package

---

## Naming Conventions

| Type               | Convention                       | Example                                   |
| ------------------ | -------------------------------- | ----------------------------------------- |
| Files (components) | kebab-case                       | `form-builder.tsx`, `data-table.tsx`      |
| Files (hooks)      | kebab-case with `use-` prefix    | `use-theme.ts`, `use-auth.tsx`            |
| Files (types)      | kebab-case                       | `branded.ts`, `errors.ts`                 |
| Files (tests)      | `*.test.ts` / `*.test.tsx`       | `http-client.test.ts`                     |
| Components         | PascalCase                       | `FormBuilder`, `DataTable`                |
| Hooks              | camelCase with `use` prefix      | `useTheme`, `useAuth`                     |
| Types              | PascalCase                       | `FieldConfig`, `CrudPagesConfig`          |
| Branded types      | `EntityId<"Name">`               | `EntityId<"User">`, `EntityId<"Product">` |
| CRUD configs       | camelCase + `Crud` suffix        | `userCrud`, `productCrud`                 |
| Entity types       | PascalCase + `Entity` suffix     | `UserEntity`, `ProductEntity`             |
| Field arrays       | camelCase + `Fields` suffix      | `userFields`, `productFields`             |
| i18n namespaces    | kebab-case, match entity name    | `"users"`, `"products"`, `"auth"`         |
| Route files        | kebab-case, match URL segments   | `index.tsx`, `new.tsx`, `$userId.tsx`     |
| Edit routes        | `$param_.edit.tsx` (underscore!) | `$userId_.edit.tsx`                       |

---

## i18n Rules

- ALL user-facing strings MUST use `t()` via `useTranslation(namespace)`
- Common actions (Save, Cancel, Delete, Create, Edit, Search, Loading) come from `"common"` namespace — NEVER redefine per entity
- Entity field labels: `t("fields.fieldName")` from entity namespace
- Entity option labels: `t("options.fieldName.optionValue")` from entity namespace
- Error messages: `t("errors:errorKey")` — colon notation for cross-namespace
- Every entity needs locale files in ALL 3 languages: `en`, `vi`, `ja`
- Module translations use `register*Translations()` function pattern
- App translations registered in `apps/admin/src/main.tsx`

**DON'T:**

```ts
// NEVER hardcode user-facing strings
<Button>Delete</Button>                    // WRONG
<Button>{t("delete")}</Button>             // CORRECT (from "common" namespace)

// NEVER define action labels per entity
{ "delete": "Delete User" }               // WRONG in users.json
// "delete" comes from common namespace

// NEVER forget a language
// If you add en/users.json, you MUST also add vi/users.json and ja/users.json
```

---

## Routing Rules

- File-based routing in `apps/admin/src/routes/`
- CRUD route files are one-liners using `lazyRouteComponent`
- Edit routes MUST use `$param_.edit.tsx` (underscore prevents nesting under detail)
- Public routes (`/login`, `/register`) are checked in `__root.tsx`
- Lazy load CRUD routes: `lazyRouteComponent(() => import(...))`

**DO:**

```tsx
// src/routes/products/$productId_.edit.tsx
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/products/$productId/edit")({
  component: lazyRouteComponent(() =>
    import("@/crud/products").then((m) => ({ default: m.productCrud.EditPage })),
  ),
});
```

**DON'T:**

```tsx
// WRONG: missing underscore — will nest under detail route
// src/routes/products/$productId/edit.tsx

// WRONG: eager import — no code splitting
import { productCrud } from "@/crud/products";
export const Route = createFileRoute("/products/")({
  component: productCrud.ListPage, // not lazy loaded
});
```

---

## Component Rules

- ALL shared UI components live in `@vx/core-uikit` only
- Apps NEVER maintain their own `components/ui/` directory
- New shadcn components: `cd packages/core-uikit && npx shadcn@latest add <name>`, then export from `components/index.ts`
- Feature modules import UI primitives from `@vx/core-uikit/components`
- FormBuilder is extensible via `renderField` and `renderFooter` props
- DataTable and FormBuilder are `React.memo` — don't wrap again
- Don't add padding to page components — root layout handles `p-4 md:p-6`

**DON'T:**

```tsx
// WRONG: padding in page component
function UsersPage() {
  return <div className="p-6">...</div>; // Root layout already adds padding
}

// WRONG: creating UI components in app
// apps/admin/src/components/ui/my-button.tsx  // NEVER DO THIS
```

---

## Security Rules

- Sanitize user HTML before `dangerouslySetInnerHTML`: `sanitizeHtml()` from `@vx/core-uikit/security`
- Mask tokens/passwords in logs: `maskSensitive()` from `@vx/core-uikit/security`
- Never log raw tokens or passwords
- Use `setTokenStorageStrategy()` before auth initialization
- Zod validation on ALL form inputs (auto-generated by CRUD generator)

**DON'T:**

```ts
// WRONG: raw user HTML
<div dangerouslySetInnerHTML={{ __html: userInput }} />

// CORRECT:
import { sanitizeHtml } from "@vx/core-uikit/security";
<div dangerouslySetInnerHTML={{ __html: sanitizeHtml(userInput) }} />

// WRONG: logging raw token
console.log("Token:", accessToken);

// CORRECT:
import { maskSensitive } from "@vx/core-uikit/security";
console.log("Token:", maskSensitive(accessToken));
```

---

## Testing Rules

- Tests co-located: `foo.test.ts` next to `foo.ts`
- Use Vitest + jsdom + @testing-library/react
- Name: `*.test.ts` or `*.test.tsx`
- Run from core-uikit: `cd packages/core-uikit && yarn test`
- Test API layer, generators, utilities, hooks, notifications, security

**DON'T:**

- Put tests in `__tests__/` directories
- Name test files `*.spec.ts` — use `*.test.ts`
- Skip tests for new utility functions or hooks

---

## Commit Message Format

```
type(scope): description

# Required types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
# Scope is optional but encouraged
# Description: lowercase, no period, imperative mood
```

**DO:**

```
feat(crud): add product entity config and routes
fix(api): handle 204 no-content response
refactor(i18n): simplify locale registration
```

**DON'T:**

```
Added product entity                     # WRONG: no type prefix
feat(crud): Add Product Entity.          # WRONG: capitalized, has period
feat: crud stuff                         # WRONG: vague description
```

---

## What NOT to Do (Common Mistakes)

| Mistake                              | Fix                                                |
| ------------------------------------ | -------------------------------------------------- |
| Using `@/` alias in core-uikit       | Use relative imports (`../`, `../../`)             |
| Creating `components/ui/` in apps    | Import from `@vx/core-uikit/components`            |
| Hardcoding strings                   | Use `t()` from `useTranslation()`                  |
| Adding padding to page components    | Root layout handles `p-4 md:p-6`                   |
| Edit route: `$param/edit.tsx`        | Use `$param_.edit.tsx` (underscore!)               |
| Defining "Save"/"Cancel" per entity  | Use `common` namespace                             |
| Putting feature logic in core-uikit  | Create a new `packages/` module                    |
| `__tests__/` directory               | Co-locate: `foo.test.ts` next to `foo.ts`          |
| Importing internal paths             | Use subpath exports: `@vx/core-uikit/api`          |
| Forgetting `@source` in app.css      | Add for each new package                           |
| Eager importing CRUD pages in routes | Use `lazyRouteComponent()`                         |
| Wrapping memoized components in memo | `DataTable` and `FormBuilder` are already memoized |
| Missing locale files                 | MUST have en, vi, AND ja for every namespace       |
