# D1 — Coloring Style: Manual + Hashtag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operators can attach normalized hashtags (with autocomplete from existing tags) when creating a style from an image and when editing a style; tags are normalized both client-side (live) and server-side (on save).

**Architecture:** A pure `tags.ts` helper (normalize + collect) is unit-tested and re-exported at `@vx/coloring/data/tags` for server routes. A presentational `TagsInput` chip component (with autocomplete) delegates its normalization to that helper. Two screens (create = `extract-style-screen`, edit = `entity-edit-screen`) drop in `TagsInput`, sourcing suggestions from `useEntityList(kind)`. Four API routes normalize `tags` before persisting.

**Tech Stack:** TypeScript, React (`@vx/coloring`), Next.js API routes, Prisma (`@vx/db`), Vitest. No new dependencies.

## Global Constraints

- **Normalize preserves unicode** (Vietnamese kept): `normalizeTag` only trims, lowercases, strips leading `#`, turns whitespace/underscore runs into a single hyphen, collapses/trims hyphens. It does NOT strip non-ASCII. `"#Bold Easy" → "bold-easy"`, `"Trẻ Em" → "trẻ-em"`, `"#" → ""`.
- **Normalize client + server:** the shared helper runs in `TagsInput` (as chips are added) AND in the 4 persist routes (authoritative).
- **Generic for both kinds:** the tag input applies to both `coloring-styles` and `art-styles` (the shared screens are `kind`-parameterized); autocomplete suggestions are per-kind.
- **Dedupe preserves first-seen order.** A tag already present is not re-added.
- **No backfill:** legacy un-normalized tags stay as-is; only create/edit-from-now normalize.
- **Autocomplete pool** is client-derived from the already-loaded `useEntityList(kind)` list via `collectTags` — no new endpoint, no extra fetch.
- **Typecheck gate:** `@vx/coloring` has no typecheck script → `cd apps/admin && yarn typecheck` (baseline `.next/dev/types/routes.d.ts` noise; judge by delta). Coloring tests: `cd packages/coloring && yarn vitest run <file>`.

---

## File Structure

**Create:**
- `packages/coloring/src/data/tags.ts` — pure helpers `normalizeTag`, `normalizeTags`, `collectTags`.
- `packages/coloring/src/data/tags.test.ts` — helper unit tests.
- `packages/coloring/src/components/ui/tags-input.tsx` — chip input with autocomplete.

**Modify:**
- `packages/coloring/package.json` — `./data/tags` subpath export.
- `apps/admin/src/app/api/coloring-styles/route.ts` — normalize tags on POST.
- `apps/admin/src/app/api/art-styles/route.ts` — normalize tags on POST.
- `apps/admin/src/app/api/coloring-styles/[id]/route.ts` — normalize tags on PUT.
- `apps/admin/src/app/api/art-styles/[id]/route.ts` — normalize tags on PUT.
- `packages/coloring/src/screens/hubs/extract-style-screen.tsx` — tags input on create.
- `packages/coloring/src/screens/entity/entity-edit-screen.tsx` — replace comma input with `TagsInput`.

---

## Task 1: Pure tag helpers

**Files:**
- Create: `packages/coloring/src/data/tags.ts`
- Test: `packages/coloring/src/data/tags.test.ts`

**Interfaces:**
- Produces:
  - `normalizeTag(raw: string): string`
  - `normalizeTags(list: string[]): string[]`
  - `collectTags(items: { tags?: string[] }[]): string[]`

- [ ] **Step 1: Write the failing test**

Create `packages/coloring/src/data/tags.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { normalizeTag, normalizeTags, collectTags } from "./tags";

describe("normalizeTag", () => {
  it("lowercases, trims, strips leading #, spaces→hyphen", () => {
    expect(normalizeTag("#Bold Easy")).toBe("bold-easy");
    expect(normalizeTag("  UPPER  ")).toBe("upper");
    expect(normalizeTag("a  b")).toBe("a-b");
    expect(normalizeTag("foo_bar")).toBe("foo-bar");
  });
  it("preserves unicode (Vietnamese)", () => {
    expect(normalizeTag("Trẻ Em")).toBe("trẻ-em");
  });
  it("collapses/trims hyphens and handles empties", () => {
    expect(normalizeTag("--x--")).toBe("x");
    expect(normalizeTag("#")).toBe("");
    expect(normalizeTag("   ")).toBe("");
    expect(normalizeTag("a---b")).toBe("a-b");
  });
});

describe("normalizeTags", () => {
  it("normalizes, drops empties, dedupes preserving first-seen order", () => {
    expect(normalizeTags(["#A", "a", "", "B", "b "])).toEqual(["a", "b"]);
    expect(normalizeTags(["Bold Easy", "bold-easy"])).toEqual(["bold-easy"]);
  });
});

describe("collectTags", () => {
  it("unions across items, normalizes, dedupes, sorts", () => {
    const items = [{ tags: ["Zebra", "#Bold Easy"] }, { tags: ["apple", "bold-easy"] }, {}];
    expect(collectTags(items)).toEqual(["apple", "bold-easy", "zebra"]);
  });
  it("handles items without tags", () => {
    expect(collectTags([{}, { tags: undefined }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/coloring && yarn vitest run src/data/tags.test.ts`
Expected: FAIL — module `./tags` not found.

- [ ] **Step 3: Write the helpers**

Create `packages/coloring/src/data/tags.ts`:
```ts
/**
 * D1: hashtag normalization. Pure module (no "use client", no imports) so it is
 * safe to import into server routes via the @vx/coloring/data/tags subpath export.
 */

/** Normalize one raw tag: trim, lowercase, strip leading '#', whitespace/underscore
 *  runs → single hyphen, collapse/trim hyphens. Preserves unicode (Vietnamese).
 *  Returns "" when the tag normalizes to nothing. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Normalize a list: map normalizeTag, drop empties, dedupe preserving first-seen order. */
export function normalizeTags(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const t = normalizeTag(raw);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Union of all tags across rows, normalized, deduped, sorted — the autocomplete pool. */
export function collectTags(items: { tags?: string[] }[]): string[] {
  const all: string[] = [];
  for (const it of items) if (Array.isArray(it.tags)) all.push(...it.tags);
  return normalizeTags(all).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/coloring && yarn vitest run src/data/tags.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/tags.ts packages/coloring/src/data/tags.test.ts
git commit -m "feat(coloring): pure hashtag helpers (normalize/collect) (D1 T-001/002)"
```

---

## Task 2: Subpath export + server-side normalization (4 routes)

**Files:**
- Modify: `packages/coloring/package.json`
- Modify: `apps/admin/src/app/api/coloring-styles/route.ts:54`
- Modify: `apps/admin/src/app/api/art-styles/route.ts:52`
- Modify: `apps/admin/src/app/api/coloring-styles/[id]/route.ts:21`
- Modify: `apps/admin/src/app/api/art-styles/[id]/route.ts:21`

**Interfaces:**
- Consumes: `normalizeTags` from `@vx/coloring/data/tags` (Task 1) — a NEW subpath export added in Step 1. `@vx/coloring` is already a workspace dep of `apps/admin`; `tags.ts` is pure (no `"use client"`) → server-safe.

- [ ] **Step 1: Add the `./data/tags` subpath export**

In `packages/coloring/package.json`, add to the `exports` map next to the existing `./data/*` lines:
```json
    "./data/page-variants": "./src/data/page-variants.ts",
    "./data/cover-candidates": "./src/data/cover-candidates.ts",
    "./data/tags": "./src/data/tags.ts",
    "./styles.css": "./src/styles/motio.css"
```

- [ ] **Step 2: Normalize tags in `POST /api/coloring-styles`**

In `apps/admin/src/app/api/coloring-styles/route.ts`, add the import at the top (after the existing imports):
```ts
import { normalizeTags } from "@vx/coloring/data/tags";
```
Then in the `prisma.coloringStyle.create` data, change:
```ts
        tags: tags || [],
```
to:
```ts
        tags: normalizeTags(tags || []),
```

- [ ] **Step 3: Normalize tags in `POST /api/art-styles`**

In `apps/admin/src/app/api/art-styles/route.ts`, add the same import:
```ts
import { normalizeTags } from "@vx/coloring/data/tags";
```
Then in the `prisma.artStyle.create` data, change:
```ts
        tags: tags || [],
```
to:
```ts
        tags: normalizeTags(tags || []),
```

- [ ] **Step 4: Normalize tags in `PUT /api/coloring-styles/[id]`**

In `apps/admin/src/app/api/coloring-styles/[id]/route.ts`, add the import:
```ts
import { normalizeTags } from "@vx/coloring/data/tags";
```
Then immediately after the destructure line:
```ts
    const { id: _, createdAt: __, regenerateDirective, newReferenceImageUrls, ...data } = body;
```
add:
```ts
    if (Array.isArray(data.tags)) data.tags = normalizeTags(data.tags);
```

- [ ] **Step 5: Normalize tags in `PUT /api/art-styles/[id]`**

In `apps/admin/src/app/api/art-styles/[id]/route.ts`, add the import:
```ts
import { normalizeTags } from "@vx/coloring/data/tags";
```
Then immediately after the destructure line:
```ts
    const { id: _, createdAt: __, regenerateDirective, newReferenceImageUrls, ...data } = body;
```
add:
```ts
    if (Array.isArray(data.tags)) data.tags = normalizeTags(data.tags);
```

- [ ] **Step 6: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors vs baseline (confirms the `@vx/coloring/data/tags` import resolves in all 4 routes).

- [ ] **Step 7: Reasoning check (no route test harness)**

Write into the commit body: both POST routes now store `normalizeTags(tags || [])`; both PUT routes normalize `data.tags` only when it is an array (so a PUT that omits tags is unaffected). All four converge on the same pure helper, so every write path persists canonical tags.

- [ ] **Step 8: Commit**

```bash
git add packages/coloring/package.json \
  apps/admin/src/app/api/coloring-styles/route.ts \
  apps/admin/src/app/api/art-styles/route.ts \
  "apps/admin/src/app/api/coloring-styles/[id]/route.ts" \
  "apps/admin/src/app/api/art-styles/[id]/route.ts"
git commit -m "feat(api): normalize style tags on save (POST/PUT × coloring+art) (D1 T-002)"
```

---

## Task 3: `TagsInput` chip component

**Files:**
- Create: `packages/coloring/src/components/ui/tags-input.tsx`

**Interfaces:**
- Consumes: `normalizeTag` from `../../data/tags` (Task 1); `Icon` from `../../lib/icon`.
- Produces: `export function TagsInput({ value, onChange, suggestions?, disabled?, placeholder? })` where `value: string[]`, `onChange: (tags: string[]) => void`, `suggestions?: string[]`, `disabled?: boolean`, `placeholder?: string`.

- [ ] **Step 1: Write the component**

Create `packages/coloring/src/components/ui/tags-input.tsx`:
```tsx
"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Icon } from "../../lib/icon";
import { normalizeTag } from "../../data/tags";

/** D1: chip input for hashtags with autocomplete. Presentational — the caller
 *  supplies `suggestions` (e.g. collectTags of the loaded list). Normalization is
 *  delegated to the tested normalizeTag helper, so chips are always canonical. */
export function TagsInput({
  value,
  onChange,
  suggestions = [],
  disabled = false,
  placeholder = "Thêm hashtag…",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    setInput("");
    if (!t || value.includes(t)) return;
    onChange([...value, t]);
  };
  const removeAt = (i: number) => onChange(value.filter((_, j) => j !== i));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeAt(value.length - 1);
    }
  };

  const q = normalizeTag(input);
  const matches = useMemo(
    () => (q ? suggestions.filter((s) => !value.includes(s) && s.includes(q)).slice(0, 8) : []),
    [q, suggestions, value],
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: 6, minHeight: 40, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: disabled ? "var(--neutral-100)" : "var(--card)", opacity: disabled ? 0.6 : 1 }}>
        {value.map((t, i) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 600, padding: "2px 4px 2px 8px", borderRadius: 99, background: "var(--neutral-200, #eee)", color: "var(--foreground)" }}>
            {t}
            {!disabled && (
              <button type="button" aria-label={`Xoá ${t}`} onClick={() => removeAt(i)}
                style={{ border: "none", background: "transparent", cursor: "pointer", display: "flex", padding: 0, color: "var(--muted-foreground)" }}>
                <Icon name="x" size={12} />
              </button>
            )}
          </span>
        ))}
        <input
          value={input}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : ""}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          style={{ flex: "1 1 80px", minWidth: 80, border: "none", outline: "none", background: "transparent", fontSize: 13, padding: "4px 2px" }}
        />
      </div>
      {focused && matches.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20, marginTop: 4, background: "var(--card)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", boxShadow: "var(--shadow-md)", overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", background: "transparent", cursor: "pointer", fontSize: 12.5, color: "var(--foreground)" }}>
              #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```
Notes: suggestions use `onMouseDown` + `preventDefault` so the click registers before the input blurs; the input does NOT auto-commit on blur (avoids double-adding a typed token when a suggestion is clicked) — the user commits with Enter/comma.

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && yarn typecheck`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add packages/coloring/src/components/ui/tags-input.tsx
git commit -m "feat(coloring): TagsInput chip component with autocomplete (D1)"
```

---

## Task 4: Wire tags into the create screen

**Files:**
- Modify: `packages/coloring/src/screens/hubs/extract-style-screen.tsx`

**Interfaces:**
- Consumes: `TagsInput` (Task 3); `collectTags` (Task 1); `useEntityList(path: string) → { items }` from `../../data/use-entity-list`.

- [ ] **Step 1: Add imports**

In `extract-style-screen.tsx`, add after the existing imports (near line 14):
```ts
import { TagsInput } from "../../components/ui/tags-input";
import { useEntityList } from "../../data/use-entity-list";
import { collectTags } from "../../data/tags";
```

- [ ] **Step 2: Add tags state + suggestions**

Inside `ExtractStyleScreen`, after `const [name, setName] = useState("");` (line ~30):
```ts
  const [tags, setTags] = useState<string[]>([]);
  const { items: styleItems } = useEntityList(kind);
  const tagSuggestions = collectTags(styleItems);
```

- [ ] **Step 3: Pass tags into create**

In the `create` function, change:
```ts
      const { id } = await svc.create({ ...result, name: name || result.name, referenceImageUrls: imgs });
```
to:
```ts
      const { id } = await svc.create({ ...result, name: name || result.name, referenceImageUrls: imgs, tags });
```

- [ ] **Step 4: Render the TagsInput in the analyze-result card**

In the result card, after the name field `<label>…Tên style…</label>` (line ~128), add a tags field before `<StyleResultView data={result} />`:
```tsx
                <label style={{ display: "block" }}><span className="mo-flabel">Hashtag</span>
                  <TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} disabled={busy !== null} />
                </label>
```

- [ ] **Step 5: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors)
Run: `cd packages/coloring && yarn test` (expect the full suite green)

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/screens/hubs/extract-style-screen.tsx
git commit -m "feat(coloring): hashtag input on style create screen (D1 T-001)"
```

---

## Task 5: Wire tags into the edit screen

**Files:**
- Modify: `packages/coloring/src/screens/entity/entity-edit-screen.tsx`

**Interfaces:**
- Consumes: `TagsInput` (Task 3); `collectTags` (Task 1); `useEntityList` from `../../data/use-entity-list`. `cfg.path` is the entity's API path (e.g. `"coloring-styles"`).

- [ ] **Step 1: Add imports**

In `entity-edit-screen.tsx`, add after the existing imports (near line 16):
```ts
import { TagsInput } from "../../components/ui/tags-input";
import { useEntityList } from "../../data/use-entity-list";
import { collectTags } from "../../data/tags";
```

- [ ] **Step 2: Hold tags as a string[] state (separate from the string form map)**

After `const [form, setForm] = useState<Record<string, string> | null>(null);` (line ~43):
```ts
  const [tags, setTags] = useState<string[]>([]);
  const { items: styleItems } = useEntityList(cfg?.path ?? "");
```
In the seeding `useEffect`, remove the `tags` key from the `init` map and seed the array instead. Change:
```ts
      const init: Record<string, string> = {
        name: (entity.displayName as string) || (entity.name as string) || "",
        description: (entity.description as string) || "",
        tags: Array.isArray(entity.tags) ? (entity.tags as string[]).join(", ") : "",
      };
      for (const k of editableStringFields(entity)) init[k] = entity[k] as string;
      setForm(init);
```
to:
```ts
      const init: Record<string, string> = {
        name: (entity.displayName as string) || (entity.name as string) || "",
        description: (entity.description as string) || "",
      };
      for (const k of editableStringFields(entity)) init[k] = entity[k] as string;
      setForm(init);
      setTags(Array.isArray(entity.tags) ? (entity.tags as string[]) : []);
```
(The `extraKeys` filter on line ~75 already excludes `"tags"`, so no change is needed there — `tags` is simply no longer in `form`.)

- [ ] **Step 3: Send the tags array on save**

In the `save` function, change:
```ts
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
```
to:
```ts
      tags,
```

- [ ] **Step 4: Replace the raw Tags input with TagsInput**

Change the Tags field:
```tsx
          <Field label="Tags"><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="cách nhau bằng dấu phẩy" /></Field>
```
to:
```tsx
          <Field label="Tags"><TagsInput value={tags} onChange={setTags} suggestions={collectTags(styleItems)} /></Field>
```

- [ ] **Step 5: Typecheck + coloring tests**

Run: `cd apps/admin && yarn typecheck` (expect no new errors — confirms `form.tags` is no longer referenced and the new state types check)
Run: `cd packages/coloring && yarn test` (expect green)

- [ ] **Step 6: Manual verification (dev, staging write enabled)**

Create a coloring style from an image (`/styles/extractcolor`): after Analyze, add hashtags (type + Enter/comma → chips; ✕ removes; Backspace on empty removes last; autocomplete suggests existing tags as you type). Create → the row stores normalized `tags` + `data.source="manual"`. Edit any style (`/entity/coloring-styles/<id>/…`): the Tags field is now the chip input, seeded from the stored tags; add/remove + save persists normalized tags. On the list, search by a tag substring finds the style. Repeat once for an art-style to confirm the generic wiring.

- [ ] **Step 7: Commit**

```bash
git add packages/coloring/src/screens/entity/entity-edit-screen.tsx
git commit -m "feat(coloring): TagsInput on style edit screen (D1 T-001/002)"
```

---

## Self-Review

**Spec coverage (`2026-08-11-d1-manual-style-hashtag-design.md`):**
- §4 pure helpers (normalizeTag/normalizeTags/collectTags) → Task 1. ✅
- §5 `TagsInput` component (chips, Enter/comma, Backspace, autocomplete) → Task 3. ✅
- §6 wiring create + edit + suggestions from `useEntityList` → Tasks 4 & 5. ✅
- §7 server normalization at 4 routes + subpath export → Task 2. ✅
- Decision "create AND edit" → Tasks 4 & 5. ✅
- Decision "client + server normalize" → Task 3 (via normalizeTag in TagsInput) + Task 2 (routes). ✅
- Decision "generic both kinds" → Task 4 uses `kind`; Task 5 uses `cfg.path`; Task 2 touches both coloring + art routes. ✅
- Decision "preserve unicode" → Task 1 `normalizeTag` (no `[^a-z0-9-]` strip) + test `"Trẻ Em"→"trẻ-em"`. ✅
- §8 tests → Task 1 (`tags.test.ts`); server reasoning check → Task 2 Step 7; manual → Task 5 Step 6. ✅
- T-001 (manual style + hashtag) → Task 4 (create already stamps source="manual" server-side). ✅
- T-002 (search + normalize + autocomplete) → existing search + Task 2 (normalize) + Task 3 (autocomplete). ✅

**Placeholder scan:** every code step has full code; the test step has real cases + expected values; the route reasoning check is explicit. Subpath import path pinned (`@vx/coloring/data/tags` via Task 2 Step 1). No TODO/TBD. ✅

**Type consistency:** `normalizeTag(string)→string`, `normalizeTags(string[])→string[]`, `collectTags({tags?:string[]}[])→string[]` identical in Task 1 (def), Task 2 (routes use `normalizeTags`), Task 3 (`TagsInput` uses `normalizeTag`), Tasks 4/5 (use `collectTags`). `TagsInput` props (`value:string[]`, `onChange:(string[])=>void`, `suggestions?:string[]`, `disabled?`, `placeholder?`) identical in Task 3 (def) and Tasks 4/5 (use). `useEntityList(path)→{items}` used consistently in Tasks 4 (`kind`) & 5 (`cfg.path`). ✅
