# Architecture

## Tech Choices & Rationale

### Why TanStack Query over SWR?
- Built-in devtools, mutation support, infinite queries
- Better TypeScript generics for typed hooks
- Supports optimistic updates natively

### Why TanStack Router over React Router?
- File-based routing with code generation
- Type-safe route params and search params
- Built-in code splitting via lazy routes

### Why Zustand over Redux/Jotai?
- Zero boilerplate, no providers needed
- Built-in localStorage persistence
- Works outside React (can use in utils)

### Why i18next over react-intl?
- Namespace-based organization matches module architecture
- Runtime bundle registration for feature modules
- Mature ecosystem with browser language detection

### Why Monorepo (Yarn Workspaces + Turbo)?
- Share code between packages without publishing
- Turbo caching speeds up builds
- Each package has clear boundaries and exports

## Layer Architecture

```
┌─────────────────────────────────────────┐
│                  Apps                   │
│  (routes, configs, translations)        │
├─────────────────────────────────────────┤
│            Feature Modules              │
│  (auth-module: hooks, components, i18n) │
├─────────────────────────────────────────┤
│             Core UIKit                  │
│  ┌──────────────────────────────────┐   │
│  │ components/  │ generators/       │   │
│  │  ui/         │ createCrudPages() │   │
│  │  crud/       │                   │   │
│  │  layout/     │                   │   │
│  ├──────────────┼───────────────────┤   │
│  │ api/         │ notifications/    │   │
│  │  http-client │ notify + store    │   │
│  │  appApi      │                   │   │
│  │  REST hooks  │                   │   │
│  ├──────────────┼───────────────────┤   │
│  │ hooks/       │ i18n/             │   │
│  │ store/       │ types/ utils/     │   │
│  └──────────────┴───────────────────┘   │
└─────────────────────────────────────────┘
```

## Data Flow

```
User Action → Component → useRestGetAll/Mutation
                            ↓
                     appApi.get/post/put/delete
                            ↓
                     httpClient (fetch + auth headers)
                            ↓
                     401? → auto refresh → retry
                            ↓
                     Response → React Query cache
                            ↓
                     notify.success/error → toast + bell
```

## Adding New Features

1. **New CRUD entity** → `yarn vx:add-entity <name>` + configure
2. **New feature module** → follow `@vx/auth-module` pattern (see CLAUDE.md)
3. **New UI component** → add to `core-uikit/src/components/ui/` via shadcn CLI
4. **New shared hook** → add to `core-uikit/src/hooks/`

## Security Model

- JWT Bearer tokens in Authorization header
- Token storage: configurable (localStorage/cookie/memory)
- Auto-refresh on 401 with race condition protection
- Zod validation on all form inputs
- Request deduplication for GET requests
