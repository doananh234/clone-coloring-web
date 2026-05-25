# Diaflow Theme Integration — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Approach:** CSS Variable Layer (Approach A)

## Summary

Add "diaflow" as a new theme variant to the VX Admin Theme, making it the default. Existing variants (default, corporate, minimal) remain available. The Diaflow design is a warm cream, hairline-driven, serif-accented design system originally built for an AI workspace product.

Key decisions:

- Diaflow = default variant, existing themes preserved
- Light + warm dark mode adaptation
- Google Fonts CDN for Mona Sans + Fraunces
- Font Awesome Pro (licensed) replaces Lucide icons globally
- Floating sidebar with 10px inset applied globally
- Standard Tailwind classes only — no custom `df-*` utilities
- Theme values flow through CSS variable overrides

## Phase 1: Theme Tokens

### What Changes

- `apps/admin/src/app/globals.css` — add `.theme-diaflow` and `.theme-diaflow.dark` variable blocks
- `packages/core-uikit/src/hooks/use-theme.ts` — add `"diaflow"` to variant union, set as default

### Diaflow Light Mode (`.theme-diaflow`)

Override existing CSS variables:

| Variable                       | Value              | Purpose               |
| ------------------------------ | ------------------ | --------------------- |
| `--background`                 | `#F4F2EE`          | Warm cream page       |
| `--foreground`                 | `#000000`          | Pure black ink        |
| `--card`                       | `#FFFFFF`          | White card            |
| `--card-foreground`            | `#000000`          |                       |
| `--popover`                    | `#FFFFFF`          |                       |
| `--popover-foreground`         | `#000000`          |                       |
| `--primary`                    | `#000000`          | Black primary actions |
| `--primary-foreground`         | `#FFFFFF`          |                       |
| `--secondary`                  | `#F9F7F4`          | Warm surface          |
| `--secondary-foreground`       | `#43484E`          | Body slate            |
| `--muted`                      | `#F9F7F4`          |                       |
| `--muted-foreground`           | `#696E77`          |                       |
| `--accent`                     | `#FEA702`          | Saigon orange         |
| `--accent-foreground`          | `#FFFFFF`          |                       |
| `--destructive`                | `#E35555`          | Softer red            |
| `--border`                     | `#E6E9EB`          | Hairline              |
| `--input`                      | `#E6E9EB`          |                       |
| `--ring`                       | `#FEA702`          | Orange focus ring     |
| `--radius`                     | `1.25rem`          | 20px base radius      |
| `--sidebar`                    | `#F9F7F4`          |                       |
| `--sidebar-foreground`         | `#000000`          |                       |
| `--sidebar-primary`            | `#000000`          |                       |
| `--sidebar-primary-foreground` | `#FFFFFF`          |                       |
| `--sidebar-accent`             | `rgba(0,0,0,0.04)` | Faint darken on hover |
| `--sidebar-accent-foreground`  | `#000000`          |                       |
| `--sidebar-border`             | `#E6E9EB`          |                       |
| `--sidebar-ring`               | `#FEA702`          |                       |

### Diaflow Dark Mode (`.theme-diaflow.dark`)

Warm dark adaptation — charcoal browns, preserved accent colors:

| Variable                 | Value                    | Purpose           |
| ------------------------ | ------------------------ | ----------------- |
| `--background`           | `#1A1816`                | Warm charcoal     |
| `--foreground`           | `#F4F2EE`                | Cream text        |
| `--card`                 | `#242220`                | Warm dark card    |
| `--card-foreground`      | `#F4F2EE`                |                   |
| `--popover`              | `#242220`                |                   |
| `--popover-foreground`   | `#F4F2EE`                |                   |
| `--primary`              | `#F4F2EE`                | Cream primary     |
| `--primary-foreground`   | `#1A1816`                |                   |
| `--secondary`            | `#2A2826`                | Warm dark surface |
| `--secondary-foreground` | `#ADB5BD`                |                   |
| `--muted`                | `#2A2826`                |                   |
| `--muted-foreground`     | `#858585`                |                   |
| `--accent`               | `#FEA702`                | Orange preserved  |
| `--accent-foreground`    | `#1A1816`                |                   |
| `--destructive`          | `#E35555`                |                   |
| `--border`               | `rgba(244,242,238,0.12)` | Cream hairline    |
| `--input`                | `rgba(244,242,238,0.15)` |                   |
| `--ring`                 | `#FEA702`                |                   |
| `--radius`               | `1.25rem`                |                   |
| `--sidebar`              | `#242220`                |                   |
| `--sidebar-foreground`   | `#F4F2EE`                |                   |
| `--sidebar-accent`       | `rgba(244,242,238,0.06)` |                   |
| `--sidebar-border`       | `rgba(244,242,238,0.10)` |                   |

### Additional Semantic Tokens

Add these as new CSS variables available across all themes but primarily used by Diaflow:

```css
--df-success: #188c5e; /* deep green */
--df-info: #2a6fdb; /* blue (rare) */
--df-shadow-pop: 0 12px 32px rgba(17, 17, 19, 0.1), 0 2px 6px rgba(17, 17, 19, 0.06);
```

Dark mode adaptations for these tokens included in `.theme-diaflow.dark`.

## Phase 2: Typography & Fonts

### What Changes

- `globals.css` — add Google Fonts `@import` for Mona Sans + Fraunces
- `.theme-diaflow` block — override `--font-sans` and `--font-heading`

### Font Configuration

```css
/* Google Fonts import at top of globals.css */
@import url("https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Mona+Sans:wght@200..900&display=swap");

/* Inside .theme-diaflow */
--font-sans: "Mona Sans", "Inter", system-ui, sans-serif;
--font-heading: "Fraunces", "Recoleta", Georgia, serif;
```

- Other variants keep `"Geist Variable", sans-serif` unchanged
- `--font-heading` is already used by card titles and headings via existing Tailwind config
- No custom type scale — use standard Tailwind `text-sm`, `text-base`, `text-lg`, `text-2xl`, etc.

## Phase 3: Sidebar — Global Floating Layout

### What Changes

- `packages/core-uikit/src/components/ui/sidebar.tsx` — restructure for floating position
- `packages/core-uikit/src/components/layout/app-sidebar.tsx` — segment structure with gaps
- Root layout — adjust content margin

### Layout Spec

**Sidebar wrapper:**

- `position: fixed`
- `left/top/bottom: 10px` (inset from viewport)
- `width: 259px` expanded / `54px` collapsed
- `border-radius: 20px` (var(--radius))
- `border: 1px solid var(--border)`
- `background: var(--sidebar)`
- `transition: width 200ms cubic-bezier(0.22, 0.61, 0.36, 1)`

**Main content (SidebarInset):**

- `margin-left: calc(259px + 20px)` expanded / `calc(54px + 20px)` collapsed
- Transition matches sidebar

**Internal segments** stacked with `gap-[5px]`:

1. Header (logo + collapse toggle) — h-[52px]
2. Action button area — h-[52px]
3. Nav + scrollable content — flex-1 overflow-auto
4. Profile chip — h-[56px]

Each segment: `bg-secondary border border-border rounded-xl`

**Collapsed rail (54px):**

- Icons centered
- Nav items: `size-8 rounded-lg` (32px square)
- Gap between items: `gap-[18px]`

**Mobile:**

- Sidebar overlays as drawer (existing offcanvas behavior)
- Retains 10px inset + rounded corners

### Shadow Philosophy

- Cards and panels: no shadow, hairline borders only
- Popovers and menus: `--df-shadow-pop` (soft long shadow)
- Override existing shadow tokens in `.theme-diaflow` to minimize/remove

## Phase 4: Font Awesome Pro Migration

### What Changes

- Install FA Pro packages in `core-uikit`
- Remove `lucide-react` from all packages
- Replace icon imports across all component files

### Packages to Install

```
@fortawesome/fontawesome-svg-core
@fortawesome/pro-regular-svg-icons    (primary — thin line style)
@fortawesome/pro-solid-svg-icons      (active/filled states)
@fortawesome/react-fontawesome
```

Added to `packages/core-uikit/package.json` as dependencies, consumed by all packages.

### Setup

Create `packages/core-uikit/src/lib/fontawesome.ts`:

- Import and configure FA library
- Export commonly used icons for convenient re-export

### Migration Scope

| Area                            | Files                       | Icon Count (approx) |
| ------------------------------- | --------------------------- | ------------------- |
| `core-uikit/components/layout/` | sidebar, nav, header        | ~15-20 icons        |
| `core-uikit/components/crud/`   | table, form, filter, dialog | ~10-15 icons        |
| `core-uikit/components/ui/`     | dialog, select, etc.        | ~5-10 icons         |
| `auth-module/components/`       | login, signup forms         | ~5 icons            |
| `apps/admin/`                   | route-specific, dashboard   | ~5-10 icons         |

### Icon Mapping (Key Examples)

| Lucide            | FA Pro Regular               |
| ----------------- | ---------------------------- |
| `ChevronRight`    | `faChevronRight`             |
| `ChevronDown`     | `faChevronDown`              |
| `Search`          | `faMagnifyingGlass`          |
| `Plus`            | `faPlus`                     |
| `Trash2`          | `faTrash`                    |
| `Pencil` / `Edit` | `faPenToSquare`              |
| `X`               | `faXmark`                    |
| `Sun` / `Moon`    | `faSun` / `faMoon`           |
| `Bell`            | `faBell`                     |
| `Settings`        | `faGear`                     |
| `User`            | `faUser`                     |
| `LogOut`          | `faRightFromBracket`         |
| `MoreHorizontal`  | `faEllipsis`                 |
| `Filter`          | `faFilter`                   |
| `ArrowUpDown`     | `faArrowsUpDown`             |
| `Eye`             | `faEye`                      |
| `Check`           | `faCheck`                    |
| `Loader2`         | `faSpinner` (with `fa-spin`) |

Full mapping built during implementation by scanning all Lucide imports.

## Phase 5: Dark Mode Tuning

### What Changes

- Verify warm dark palette across all component states
- Adjust tokens if contrast or readability issues found
- Test: cards on background, text hierarchy, accent visibility, form inputs, sidebar

### Design Intent

The dark mode should feel like a "warm evening" version of the cream palette:

- Charcoal browns (`#1A1816`, `#242220`, `#2A2826`) instead of cool grays
- Cream text (`#F4F2EE`) instead of pure white
- Orange accent remains vibrant
- Success green and destructive red maintain contrast
- Borders use cream with low opacity (0.10-0.15) for subtle warmth

### Contrast Requirements

- Body text on background: minimum 4.5:1 ratio (WCAG AA)
- Muted text on background: minimum 3:1 ratio
- Accent on background: verify visibility

## Phase 6: Component Style Adjustments

### Shadow Removal

Override shadow tokens in `.theme-diaflow`:

```css
/* Most shadows stripped — hairline-driven chrome */
--shadow-sm: none;
--shadow: none;
--shadow-md: none;
/* Popovers keep shadow */
```

Components that used shadows now rely on `border border-border` hairlines.

### Interaction States

- **Hover:** background shifts between surface tones (`bg-secondary` to `bg-background`), no color highlights
- **Press:** 2-3% darkening, no scale transforms
- **Disabled:** opacity-based (`opacity-20` to `opacity-50`), not separate gray colors
- **Focus:** orange ring (`--ring: #FEA702`)

### Motion

Override transition defaults in `.theme-diaflow`:

```css
--transition-timing: cubic-bezier(0.22, 0.61, 0.36, 1);
```

Sidebar transition: `width 200ms`, content margin: `margin-left 200ms`. No bouncy or spring animations.

## Implementation Order

| Phase                    | Dependency               | Effort      |
| ------------------------ | ------------------------ | ----------- |
| 1. Theme tokens          | None                     | Low-Medium  |
| 2. Typography            | Phase 1                  | Low         |
| 3. Sidebar float         | Phase 1                  | High        |
| 4. Font Awesome Pro      | None (parallel with 1-3) | High (wide) |
| 5. Dark mode tuning      | Phase 1-3                | Low         |
| 6. Component adjustments | Phase 1-3                | Medium      |

Phases 1-3 are sequential. Phase 4 can run in parallel. Phases 5-6 are polish after the core is in place.

## Out of Scope

- Diaflow-specific product components (ChatInput, Greeting, ShinyBadge, Shortcuts) — these are product UI, not admin theme
- Custom SVG brand logos — admin keeps its own branding
- Font Awesome icon mapping for Diaflow product nav (Flows, Pages, Tables, etc.) — admin has its own nav items
- 5px spacing base override of Tailwind — use standard Tailwind spacing, approximate where needed

## Risk Assessment

| Risk                               | Mitigation                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| FA Pro auth/registry setup         | Verify `.npmrc` token config before install                            |
| Sidebar float breaks mobile layout | Test offcanvas drawer retains functionality                            |
| Warm dark contrast issues          | Run WCAG contrast checks during Phase 5                                |
| Google Fonts CDN latency           | `display=swap` ensures text visible during load                        |
| Existing variant regression        | Theme tokens are scoped to `.theme-diaflow` — other variants untouched |

## Unresolved Questions

- FA Pro npm registry token — need to verify `.npmrc` is configured for `@fortawesome` scope
- Exact sidebar animation for mobile drawer — keep existing offcanvas or match desktop float?
