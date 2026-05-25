# Contributing Guide

> Developer guide for contributing to VX Admin Theme. For technical details, see [TECHNICAL.md](./TECHNICAL.md). For quick recipes, see [AI-GUIDE.md](./AI-GUIDE.md).

## Prerequisites

| Tool     | Version  | Install                                                      |
| -------- | -------- | ------------------------------------------------------------ |
| Node.js  | >= 18    | [nodejs.org](https://nodejs.org)                             |
| Yarn     | 4.14.1   | `corepack enable && corepack prepare yarn@4.14.1 --activate` |
| Corepack | Built-in | Comes with Node 16+                                          |

## Getting Started

```bash
# Clone
git clone <repo-url> && cd new-admin-theme

# Install (Yarn 4 PnP/node_modules)
yarn install

# Start dev server (admin app at http://localhost:5173)
yarn dev --filter=@vx/admin

# Run tests
cd packages/core-uikit && yarn test

# Type check all packages
yarn typecheck

# Lint all packages
yarn lint
```

## Project Structure

```
new-admin-theme/
├── apps/
│   └── admin/                       # @vx/admin — thin app layer
│       ├── src/
│       │   ├── crud/                # CRUD configs (one file per entity)
│       │   │   ├── _template.ts     # Template for new entities
│       │   │   └── users.ts         # User entity config
│       │   ├── routes/              # TanStack file-based routes
│       │   │   ├── __root.tsx       # Root layout
│       │   │   ├── login.tsx
│       │   │   ├── register.tsx
│       │   │   └── users/           # User CRUD routes (4 files)
│       │   ├── i18n/locales/        # App-specific translations (en/vi/ja)
│       │   ├── lib/navigate.ts      # appNavigate() for SPA routing
│       │   ├── mocks/               # Mock data
│       │   └── main.tsx             # Entry point
│       ├── mock-api.ts              # Vite plugin mock API
│       └── app.css                  # Tailwind + CSS variables
├── packages/
│   ├── core-uikit/                  # @vx/core-uikit — shared infrastructure
│   │   └── src/
│   │       ├── components/
│   │       │   ├── ui/              # shadcn base components
│   │       │   ├── crud/            # DataTable, FormBuilder, DetailView, FilterBar, ConfirmDialog
│   │       │   └── layout/          # AppSidebar, SiteHeader, NavMain, NavUser, NotificationBell
│   │       ├── api/                 # HTTP client (4 layers)
│   │       ├── generators/          # createCrudPages()
│   │       ├── hooks/               # useTheme, useIsMobile, useLocale
│   │       ├── i18n/                # I18nProvider, registerTranslations, formatting hooks
│   │       ├── notifications/       # notify, notifyError, store, bell
│   │       ├── store/               # useUIStore (Zustand)
│   │       ├── security/            # sanitizeHtml, maskSensitive, dedup
│   │       ├── performance/         # reportWebVitals
│   │       ├── types/               # User, branded IDs, errors
│   │       ├── utils/               # cn(), interpolatePath(), assertNever()
│   │       └── config/              # env helpers
│   └── auth-module/                 # @vx/auth-module — auth feature
│       └── src/
│           ├── components/          # LoginForm, SignupForm
│           ├── hooks/               # AuthProvider, useAuth
│           ├── i18n/                # Auth translations + registerAuthTranslations()
│           ├── config.ts            # authEndpoints
│           └── types.ts             # LoginCredentials, RegisterData, AuthTokens
└── tooling/
    ├── cli/                         # add-entity CLI
    ├── eslint-config/               # Shared ESLint config
    ├── tsconfig/                    # Shared TypeScript configs
    └── tailwind-config/             # Shared Tailwind config
```

## Code Style

### Prettier

Configured at root level. Auto-runs on staged files via lint-staged.

Targets: `*.{ts,tsx,json,md,css,yml,yaml}`

### ESLint

Each package has its own ESLint config extending `@vx/eslint-config` from `tooling/eslint-config/`.

### Conventional Commits

Enforced by commitlint via Husky `commit-msg` hook. Config: `@commitlint/config-conventional`.

Format:

```
type(scope): description

# Examples:
feat(crud): add product entity config and routes
fix(api): handle 204 response in http-client
docs: update CONTRIBUTING.md with new module guide
refactor(i18n): simplify locale registration
chore: update dependencies
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Git Workflow

### Husky Hooks

| Hook         | Action                                                            |
| ------------ | ----------------------------------------------------------------- |
| `pre-commit` | `npx lint-staged` (Prettier + ESLint on staged files)             |
| `commit-msg` | `npx --no -- commitlint --edit $1` (enforce conventional commits) |

### lint-staged Config (root `package.json`)

```json
{
  "*.{ts,tsx}": ["prettier --write", "eslint --fix"],
  "*.{json,md,css,yml,yaml}": ["prettier --write"]
}
```

## How to Add a New CRUD Entity

### Option A: CLI (recommended)

```bash
yarn vx:add-entity products
```

This scaffolds config, routes, and locale files.

### Option B: Manual

**Step 1:** Create config file `apps/admin/src/crud/products.ts`

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

**Step 2:** Create locale files for each language

`apps/admin/src/i18n/locales/en/products.json`:

```json
{
  "title": "Product Management",
  "fields": { "name": "Product Name", "price": "Price", "category": "Category" },
  "options": { "category": { "electronics": "Electronics", "clothing": "Clothing" } }
}
```

Repeat for `vi/` and `ja/`.

**Step 3:** Register translations in `apps/admin/src/main.tsx`

```ts
import enProducts from "./i18n/locales/en/products.json";
import viProducts from "./i18n/locales/vi/products.json";
import jaProducts from "./i18n/locales/ja/products.json";
registerTranslations("en", "products", enProducts);
registerTranslations("vi", "products", viProducts);
registerTranslations("ja", "products", jaProducts);
```

**Step 4:** Create 4 route files in `apps/admin/src/routes/products/`

Each route file is ~4 lines:

```tsx
// src/routes/products/index.tsx
import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";
export const Route = createFileRoute("/products/")({
  component: lazyRouteComponent(() =>
    import("@/crud/products").then((m) => ({ default: m.productCrud.ListPage })),
  ),
});
```

Route files needed:

- `index.tsx` — ListPage
- `new.tsx` — CreatePage
- `$productId.tsx` — DetailPage
- `$productId_.edit.tsx` — EditPage (underscore prevents nesting)

**Step 5:** Add to sidebar in `packages/core-uikit/src/components/layout/app-sidebar.tsx`

**Step 6:** Add mock API handlers in `apps/admin/mock-api.ts` (for dev)

## How to Add a New Feature Module

Follow `@vx/auth-module` pattern exactly.

**Step 1:** Create package directory

```
packages/my-module/
├── package.json
├── tsconfig.json
└── src/
    ├── components/          # Feature UI
    │   ├── my-screen.tsx
    │   └── index.ts
    ├── hooks/               # Feature hooks/providers
    │   ├── use-my-hook.tsx
    │   └── index.ts
    ├── i18n/                # Feature translations
    │   ├── locales/en/my-module.json
    │   ├── locales/vi/my-module.json
    │   ├── locales/ja/my-module.json
    │   └── index.ts         # registerMyModuleTranslations()
    ├── config.ts            # Feature endpoints
    ├── types.ts             # Feature types
    └── index.ts             # Root barrel export
```

**Step 2:** `package.json` with subpath exports

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

**Step 3:** Wire into app

1. Add `"@vx/my-module": "workspace:*"` to `apps/admin/package.json`
2. Add `@source "../../../packages/my-module/src/**/*.{ts,tsx}";` in `apps/admin/src/app.css`
3. Call `registerMyModuleTranslations()` in `apps/admin/src/main.tsx`
4. Run `yarn install`

## How to Add a New shadcn Component

```bash
cd packages/core-uikit
npx shadcn@latest add <component-name>
```

Then export from `packages/core-uikit/src/components/index.ts`.

Components install to `packages/core-uikit/src/components/ui/`.

## Testing Conventions

- **Framework:** Vitest + jsdom + @testing-library/react
- **Co-located:** Test files sit next to source: `foo.ts` + `foo.test.ts`
- **Naming:** `*.test.ts` or `*.test.tsx`
- **Location:** `packages/core-uikit/src/` (tests run from core-uikit)
- **Run:** `cd packages/core-uikit && yarn test`

### What to Test

- API layer (http-client, appApi, REST hooks)
- Generators (createCrudPages, buildSchemaFromFields)
- Utility functions (interpolatePath, cn)
- Hooks (useTheme)
- Notification system
- Security utilities

### Running Tests

```bash
cd packages/core-uikit
yarn test          # single run
yarn test:watch    # watch mode
```

## PR Checklist

- [ ] Follows conventional commit format
- [ ] All user-facing strings use i18n (`t()` / `useTranslation()`)
- [ ] Locale files created for en, vi, ja
- [ ] Tests added/updated for new logic
- [ ] No `@/` alias in core-uikit (use relative imports)
- [ ] UI components in `@vx/core-uikit` only (not in apps)
- [ ] New packages have subpath exports in `package.json`
- [ ] `@source` directive added in `app.css` for new packages
- [ ] No padding in page components (root layout handles it)
- [ ] Edit routes use `$param_.edit.tsx` naming
- [ ] `yarn typecheck` passes
- [ ] `yarn lint` passes
