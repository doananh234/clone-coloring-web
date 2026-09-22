# Intro Regen Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the intro-page regen dialog its own prompt, split into two operator-chosen variants, so each request carries only the rules that apply and stays under KingCong's 4,000-char truncation point.

**Architecture:** A new pure builder in `server-core` produces one of two prompts. A new admin route serves it, inlining the book's own title/subtitle. The regen dialog gains a two-button variant switch. The worker is untouched — it already prefers the dialog's `promptOverride`.

**Tech Stack:** TypeScript, Next.js App Router (admin), React (coloring package), Vitest, Prisma.

## Global Constraints

- **Do not modify `buildPageRegenPrompt()`, `page-regen-prompt.ts`, or `/api/page-regen-prompt`.** Those serve interior regen and the clone reproduce helper, and are out of scope.
- **Do not modify the worker.** `runRegen` already prefers `payload.promptOverride`.
- Both prompts must stay under **4,000 chars counting each newline as 2** (KingCong's `capPrompt()` budget).
- The builder is **pure**: no `process.env` reads, no DB access, no frame instruction.
- Prompt bodies are **plain ASCII** — no `═`, no em-dashes, no smart quotes. The original's decorative rules were pure overhead against the char budget.
- Follow the repo's co-located test convention: `foo.test.ts` next to `foo.ts`.

---

### Task 1: The prompt builder

**Files:**
- Create: `packages/server-core/src/ai/prompts/intro-regen-prompt.ts`
- Test: `packages/server-core/src/ai/prompts/intro-regen-prompt.test.ts`
- Modify: `packages/server-core/src/ai/prompts/index.ts` (add export)

**Interfaces:**
- Consumes: `KDP_FRAME_INSTRUCTION` from `./frame` (test only, to assert absence).
- Produces: `buildIntroRegenPrompt(options: IntroRegenPromptOptions): string`, `type IntroPageVariant = "title" | "text"`, `interface IntroRegenPromptOptions { variant: IntroPageVariant; title?: string; subtitle?: string; changePercent?: number }`. Task 2 imports both the function and `IntroPageVariant` from `@vx/server-core/ai/prompts`.

- [ ] **Step 1: Write the failing test**

Create `packages/server-core/src/ai/prompts/intro-regen-prompt.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildIntroRegenPrompt } from "./intro-regen-prompt";
import { KDP_FRAME_INSTRUCTION } from "./frame";

/**
 * KingCong's capPrompt() truncates over 4000 chars and counts a newline as CRLF.
 * The prompt this replaces was 4007 chars, so its tail — the whole text-page rule
 * set — was silently cut before the request was sent. That is the regression this
 * file exists to prevent, so both variants are pinned against the real budget.
 */
const KINGCONG_BUDGET = 4000;
const kingcongLength = (s: string) => s.length + (s.match(/\n/g)?.length ?? 0);

const title = buildIntroRegenPrompt({ variant: "title", title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
const text = buildIntroRegenPrompt({ variant: "text" });

describe("buildIntroRegenPrompt — KingCong budget", () => {
  it("keeps the title variant under the truncation point", () => {
    expect(kingcongLength(title)).toBeLessThan(KINGCONG_BUDGET);
  });

  it("keeps the text variant under the truncation point", () => {
    expect(kingcongLength(text)).toBeLessThan(KINGCONG_BUDGET);
  });

  it("stays under budget even with a long title and subtitle", () => {
    const long = buildIntroRegenPrompt({
      variant: "title",
      title: "A".repeat(300),
      subtitle: "B".repeat(300),
    });
    expect(kingcongLength(long)).toBeLessThan(KINGCONG_BUDGET);
  });
});

describe("buildIntroRegenPrompt — title variant", () => {
  it("quotes the title and subtitle so the model spells them correctly", () => {
    expect(title).toContain('- Title: "Dinosaur Adventures"');
    expect(title).toContain('- Subtitle: "50 Fun Pages"');
  });

  it("always asks for the copyright line to be copied from the source", () => {
    expect(title).toContain("- Copyright line: reproduce it word-for-word from the source image.");
  });

  it("omits the subtitle line when there is no subtitle", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "Solo" });
    expect(p).toContain('- Title: "Solo"');
    expect(p).not.toContain("- Subtitle:");
  });

  it("omits the subtitle line when the subtitle is blank", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "Solo", subtitle: "   " });
    expect(p).not.toContain("- Subtitle:");
  });

  it("omits the title line when there is no title", () => {
    const p = buildIntroRegenPrompt({ variant: "title" });
    expect(p).not.toContain("- Title:");
    expect(p).toContain("- Copyright line:");
  });

  it("trims surrounding whitespace off the inlined strings", () => {
    const p = buildIntroRegenPrompt({ variant: "title", title: "  Padded  " });
    expect(p).toContain('- Title: "Padded"');
  });

  it("defaults the variation budget to 55%", () => {
    expect(title).toContain("~55% change");
  });

  it("uses a supplied changePercent", () => {
    expect(buildIntroRegenPrompt({ variant: "title", changePercent: 40 })).toContain("~40% change");
  });

  it("falls back to 55% for a zero changePercent", () => {
    expect(buildIntroRegenPrompt({ variant: "title", changePercent: 0 })).toContain("~55% change");
  });
});

describe("buildIntroRegenPrompt — text variant", () => {
  it("is a faithful reproduction, not a variation", () => {
    expect(text).toContain("NOT a creative variation");
    expect(text).not.toContain("% change");
  });

  it("never names the book, even when title and subtitle are passed", () => {
    const p = buildIntroRegenPrompt({ variant: "text", title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
    expect(p).not.toContain("Dinosaur Adventures");
    expect(p).not.toContain("50 Fun Pages");
  });

  it("forbids adding an illustration", () => {
    expect(text).toContain("add any illustration");
  });
});

describe("buildIntroRegenPrompt — not an interior page", () => {
  it("never appends the KDP colouring frame", () => {
    expect(title).not.toContain(KDP_FRAME_INSTRUCTION);
    expect(text).not.toContain(KDP_FRAME_INSTRUCTION);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/server-core && yarn vitest run src/ai/prompts/intro-regen-prompt.test.ts
```

Expected: FAIL — `Failed to resolve import "./intro-regen-prompt"`.

- [ ] **Step 3: Write the implementation**

Create `packages/server-core/src/ai/prompts/intro-regen-prompt.ts`:

```ts
/**
 * Prompt for redrawing one INTRO page of a coloring book (book.summaryPages):
 * either a title page, or a text-only utility page (copyright, legal notice,
 * table of contents, dedication, "this book belongs to").
 *
 * Deliberately separate from buildPageRegenPrompt(), which serves interior
 * coloring pages: that one preserves a scene and appends the KDP colouring
 * frame, both wrong here.
 *
 * The operator picks the variant in the regen dialog, so only the matching rule
 * set is built. The Diaflow prompt this replaces made the model classify the
 * page itself and then carried BOTH rule sets — 4007 chars, over KingCong's
 * 4000-char cap, so capPrompt() truncated the tail and dropped the text-page
 * rules entirely. Half of each request was text to be discarded anyway.
 *
 * No brand variable: an intro page stored on a Book was produced by the clone
 * pipeline with the brand already rendered into the image, so the prompt asks
 * for the copyright line to be copied from the source rather than substituting
 * a brand name (Book has no relation to Brand — the brand lives on CloneJob).
 *
 * Pure: no env reads, no DB access, no frame instruction.
 */

export type IntroPageVariant = "title" | "text";

export interface IntroRegenPromptOptions {
  /** Which rule set to build. Chosen by the operator in the regen dialog. */
  variant: IntroPageVariant;
  /** book.title — inlined so the model spells it right. Line omitted if blank. */
  title?: string;
  /** book.subtitle — line omitted if blank. */
  subtitle?: string;
  /** Variation budget for the title variant. Default 55. Unused for "text". */
  changePercent?: number;
}

const DEFAULT_CHANGE_PERCENT = 55;

export function buildIntroRegenPrompt(options: IntroRegenPromptOptions): string {
  return options.variant === "text" ? TEXT_PAGE_PROMPT : buildTitlePagePrompt(options);
}

/**
 * A title page: illustration plus title lettering. The variation budget is spent
 * on the illustration — the lettering treatment is pinned, because intro title
 * lettering normally has to match the cover, and image models misspell text they
 * are asked to redraw in a new style.
 */
function buildTitlePagePrompt({ title, subtitle, changePercent }: IntroRegenPromptOptions): string {
  const pct = changePercent || DEFAULT_CHANGE_PERCENT;
  const textLines = [
    title?.trim() ? `- Title: "${title.trim()}"` : "",
    subtitle?.trim() ? `- Subtitle: "${subtitle.trim()}"` : "",
    "- Copyright line: reproduce it word-for-word from the source image.",
  ]
    .filter(Boolean)
    .join("\n");

  return `This is the INTRO / TITLE page of a coloring book - not a printed cover, and not a page meant to be colored in. Redraw it as a refreshed variation (~${pct}% change). Output must be 1 single frame, never a split panel or grid.

TEXT - HIGHEST PRIORITY. Every word exactly as written, correctly spelled, fully legible, nothing cropped or overlapped:
${textLines}
Add no other words, taglines or placeholder text. Keep the original lettering treatment: same font style and weight, same outlined / bubble-letter look, same relative size and position.

KEEP: the vertical order (title top, illustration middle, descriptive text below, copyright bottom); generous white margins on all four sides, artwork must NOT bleed to the edges; black-and-white / grayscale only; the illustration's art style, rendering technique and level of shading; its subject and theme.

CHANGE: the characters' pose, viewing angle and arrangement; the props and decorative elements around them; background details, theme intact.

DO NOT: reword or shorten any text; drop the copyright line; add color, a barcode, an ISBN or a QR code; go full-bleed; flatten the illustration into blank line art with empty interiors.`;
}

/**
 * A text-only page. This is a reproduction task, not a variation: the wording is
 * legal or navigational, so there is nothing safe to redesign. The DO NOT block
 * is what stops the model turning a copyright page into an illustrated one.
 */
const TEXT_PAGE_PROMPT = `This is a text-only INTRO page of a coloring book (copyright, legal notice, table of contents, dedication, or "this book belongs to"). Reproduce it faithfully - this is NOT a creative variation, change as little as possible. Output must be 1 single frame.

TEXT - HIGHEST PRIORITY. Reproduce every text block from the source image: same wording, same order, same position, correctly spelled and fully legible. Do not omit, shorten, summarise or rephrase any sentence, including long legal paragraphs. Keep website URLs, email addresses and social handles character-for-character. Add no new words, headings or taglines.

KEEP: plain white page, black text, generous margins on all four sides; text blocks centered and stacked vertically with the same spacing; font family, weight, alignment and relative sizes; any logo or icon at its original position and size.

DO NOT: add a book title, subtitle or book name anywhere; add any illustration, character, animal, room, scene or background artwork; add a decorative frame, border or ornamental divider; convert any part into line art; reword or remove the legal paragraphs.`;
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd packages/server-core && yarn vitest run src/ai/prompts/intro-regen-prompt.test.ts
```

Expected: PASS, 17 tests.

- [ ] **Step 5: Export from the prompts barrel**

In `packages/server-core/src/ai/prompts/index.ts`, directly below the existing `page-regen-prompt` export block, add:

```ts
export { buildIntroRegenPrompt } from "./intro-regen-prompt";
export type { IntroRegenPromptOptions, IntroPageVariant } from "./intro-regen-prompt";
```

- [ ] **Step 6: Run the full server-core suite and typecheck**

```bash
cd packages/server-core && yarn test && yarn typecheck
```

Expected: all tests pass (including the untouched `page-regen-prompt.test.ts`), no type errors.

- [ ] **Step 7: Commit**

```bash
git add packages/server-core/src/ai/prompts/intro-regen-prompt.ts \
        packages/server-core/src/ai/prompts/intro-regen-prompt.test.ts \
        packages/server-core/src/ai/prompts/index.ts
git commit -m "feat(intro-regen): prompt builder split by page variant

An intro page got the interior regen prompt, which preserves a scene and appends
the KDP colouring frame - wrong on a title or copyright page. The Diaflow prompt
that worked instead made the model classify the page and carried both rule sets:
4007 chars, past KingCong's 4000-char cap, so capPrompt() truncated the tail and
the text-page rules never reached the model.

The operator picks the variant, so only the matching rule set is built: 1318
chars for a title page, 1123 for a text page. Tests pin both against the cap.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The admin route

**Files:**
- Create: `apps/admin/src/app/api/intro-regen-prompt/route.ts`
- Test: `apps/admin/src/app/api/intro-regen-prompt/route.test.ts`

**Interfaces:**
- Consumes: `buildIntroRegenPrompt`, `IntroPageVariant` from `@vx/server-core/ai/prompts` (Task 1); `prisma` from `@vx/db`.
- Produces: `GET /api/intro-regen-prompt?variant=title|text&bookId=<id>` returning `{ prompt: string }`. Task 3 calls this.

- [ ] **Step 1: Write the failing test**

Create `apps/admin/src/app/api/intro-regen-prompt/route.test.ts`:

```ts
// apps/admin/src/app/api/intro-regen-prompt/route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { book: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/intro-regen-prompt${qs}`));

describe("GET /api/intro-regen-prompt", () => {
  beforeEach(() => {
    findUnique.mockReset();
    findUnique.mockResolvedValue({ title: "Dinosaur Adventures", subtitle: "50 Fun Pages" });
  });

  it("inlines the book's title and subtitle for the title variant", async () => {
    const body = await (await get("?variant=title&bookId=b1")).json();
    expect(body.prompt).toContain('- Title: "Dinosaur Adventures"');
    expect(body.prompt).toContain('- Subtitle: "50 Fun Pages"');
  });

  it("defaults to the title variant when none is given", async () => {
    const body = await (await get("?bookId=b1")).json();
    expect(body.prompt).toContain("INTRO / TITLE page");
  });

  it("defaults to the title variant for an unknown value", async () => {
    const body = await (await get("?variant=banana&bookId=b1")).json();
    expect(body.prompt).toContain("INTRO / TITLE page");
  });

  it("serves the text variant without touching the database", async () => {
    const body = await (await get("?variant=text")).json();
    expect(body.prompt).toContain("NOT a creative variation");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("omits a null subtitle rather than printing null", async () => {
    findUnique.mockResolvedValue({ title: "Solo", subtitle: null });
    const body = await (await get("?variant=title&bookId=b1")).json();
    expect(body.prompt).toContain('- Title: "Solo"');
    expect(body.prompt).not.toContain("- Subtitle:");
  });

  it("400s when the title variant has no bookId", async () => {
    expect((await get("?variant=title")).status).toBe(400);
  });

  it("404s for a book that does not exist", async () => {
    findUnique.mockResolvedValue(null);
    expect((await get("?variant=title&bookId=nope")).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd apps/admin && yarn vitest run src/app/api/intro-regen-prompt/route.test.ts
```

Expected: FAIL — `Failed to resolve import "./route"`.

- [ ] **Step 3: Write the implementation**

Create `apps/admin/src/app/api/intro-regen-prompt/route.ts`:

```ts
// apps/admin/src/app/api/intro-regen-prompt/route.ts
// Default prompt for the INTRO page regen dialog, one per variant. The sibling
// /api/page-regen-prompt serves interior pages and is untouched.
//
// The dialog prefills its editable box from here, so what this returns must be
// exactly what the worker will send. Title and subtitle are inlined from the
// book because quoting the strings helps the image model spell them.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@vx/db";
import { buildIntroRegenPrompt, type IntroPageVariant } from "@vx/server-core/ai/prompts";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("variant");
  const variant: IntroPageVariant = raw === "text" ? "text" : "title";

  // A text page never quotes the book title, so skip the lookup entirely.
  if (variant === "text") {
    return NextResponse.json({ prompt: buildIntroRegenPrompt({ variant }) });
  }

  const bookId = req.nextUrl.searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "bookId is required for the title variant" }, { status: 400 });
  }

  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { title: true, subtitle: true },
  });
  if (!book) return NextResponse.json({ error: "Book not found" }, { status: 404 });

  return NextResponse.json({
    prompt: buildIntroRegenPrompt({
      variant,
      title: book.title ?? undefined,
      subtitle: book.subtitle ?? undefined,
    }),
  });
}

export const dynamic = "force-dynamic";
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd apps/admin && yarn vitest run src/app/api/intro-regen-prompt/route.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/intro-regen-prompt/
git commit -m "feat(intro-regen): route serving the per-variant intro prompt

GET /api/intro-regen-prompt?variant=title|text&bookId= returns what the worker
will actually send, so the dialog's editable box cannot drift from it. The title
variant inlines book.title/subtitle; the text variant needs neither and skips the
query. /api/page-regen-prompt is left to interior regen.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The variant switch in the regen dialog

**Files:**
- Modify: `packages/coloring/src/screens/books/intro-actions-row.tsx`

**Interfaces:**
- Consumes: `GET /api/intro-regen-prompt` (Task 2).
- Produces: no exported API change — `IntroActionsRow` keeps its current props.

The variant union is declared locally rather than imported from `@vx/server-core`, to keep that server-only package out of the client bundle.

- [ ] **Step 1: Add the variant type above the component**

In `intro-actions-row.tsx`, insert immediately above the `export function IntroActionsRow({` line (after the existing block comment):

```ts
/**
 * Which rule set the regen prompt uses. "title" = a title page (illustration
 * plus title lettering, redrawn ~55% different); "text" = a text-only utility
 * page (copyright, table of contents, dedication, "this book belongs to"),
 * reproduced faithfully. Declared here rather than imported from server-core so
 * that server-only package stays out of the client bundle.
 */
type IntroVariant = "title" | "text";
```

- [ ] **Step 2: Replace the prompt state with a per-variant cache**

Replace these three lines:

```ts
  const [promptText, setPromptText] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
```

with:

```ts
  const [promptText, setPromptText] = useState("");
  /** Server default per variant, cached so switching back does not refetch. */
  const [defaultPrompts, setDefaultPrompts] = useState<Partial<Record<IntroVariant, string>>>({});
  const [variant, setVariant] = useState<IntroVariant>("title");
  const [loadingPrompt, setLoadingPrompt] = useState(false);
```

- [ ] **Step 3: Replace `openPrompt` with a variant-aware loader**

Replace the whole `openPrompt` function (from its doc comment through its closing `};`) with:

```ts
  /**
   * Open the dialog on variant `v`, fetching the server's own prompt for it so
   * the box shows what really gets sent.
   */
  const loadPrompt = async (v: IntroVariant) => {
    setErr(null);
    setPromptOpen(true);
    setVariant(v);
    const cached = defaultPrompts[v];
    if (cached) {
      setPromptText(cached);
      return;
    }
    setLoadingPrompt(true);
    try {
      const qs = new URLSearchParams({ variant: v, bookId });
      const res = await httpGet<{ prompt?: string }>(`${COLORING_API_BASE}/intro-regen-prompt?${qs}`);
      const p = res?.prompt ?? "";
      setDefaultPrompts((prev) => ({ ...prev, [v]: p }));
      setPromptText(p);
    } catch {
      setErr("Không tải được prompt mặc định — bạn vẫn có thể tự nhập.");
    } finally {
      setLoadingPrompt(false);
    }
  };
```

- [ ] **Step 4: Point the two openers at the current variant**

There are exactly two `onClick={openPrompt}` call sites — the "Regen" button in the action row, and the "Tạo lại" button in the candidate strip. Change both to:

```tsx
onClick={() => loadPrompt(variant)}
```

- [ ] **Step 5: Derive the active default in the render body**

Immediately above the component's `return (`, add:

```ts
  const activeDefault = defaultPrompts[variant] ?? "";
```

Then in the dialog footer's "Khôi phục mặc định" button, replace `defaultPrompt` with `activeDefault` in both places:

```tsx
                disabled={busy !== null || loadingPrompt || !activeDefault || promptText === activeDefault}
                onClick={() => setPromptText(activeDefault)}
```

- [ ] **Step 6: Add the variant switch to the dialog**

In the dialog, between the explanatory `<p>` and the `<textarea>`, insert:

```tsx
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {(
                [
                  { v: "title" as const, label: "Trang tựa có hình", hint: "Có minh hoạ + chữ tựa — vẽ lại khác ~55%" },
                  { v: "text" as const, label: "Trang chữ thuần", hint: "Chỉ có chữ (bản quyền, mục lục…) — chép lại trung thành" },
                ]
              ).map(({ v, label, hint }) => (
                <Button
                  key={v}
                  variant={variant === v ? "primary" : "outline"}
                  size="sm"
                  title={hint}
                  disabled={busy !== null || loadingPrompt}
                  onClick={() => {
                    if (v !== variant) void loadPrompt(v);
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
```

Clicking the already-selected variant is a no-op, so the operator cannot lose their edits to a needless refetch.

- [ ] **Step 7: Update the dialog's explanatory copy**

Replace the `<p>` above the switch with:

```tsx
            <p style={{ fontSize: 12.5, color: "var(--muted-foreground)", margin: "0 0 10px" }}>
              Chọn loại trang, rồi sửa prompt nếu cần. Nội dung trong ô sẽ <strong>thay thế hoàn toàn</strong> prompt mặc định.
            </p>
```

- [ ] **Step 8: Typecheck and run the coloring suite**

`packages/coloring` has no `typecheck` script of its own; the admin app imports
these screens, so its `tsc --noEmit` covers them.

```bash
cd packages/coloring && yarn test
cd ../../apps/admin && yarn typecheck
```

Expected: existing coloring tests (including `use-page-actions.test.ts`) still pass; no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/coloring/src/screens/books/intro-actions-row.tsx
git commit -m "feat(intro-regen): pick the page variant in the regen dialog

Two buttons above the prompt box - \"Trang tựa có hình\" and \"Trang chữ thuần\" -
choose which rule set gets sent, replacing the model's own guess. Each variant's
default is fetched once and cached, and clicking the selected one is a no-op so a
stray click cannot discard the operator's edits.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Verify end to end against a real book

**Files:** none — this is a manual verification gate.

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Confirm both prompts fit the KingCong budget in practice**

```bash
cd packages/server-core && yarn vitest run src/ai/prompts/intro-regen-prompt.test.ts -t "budget"
```

Expected: PASS, 3 tests. This is the check that the truncation bug is actually gone.

- [ ] **Step 2: Run every affected suite**

```bash
cd packages/server-core && yarn test
cd ../../apps/admin && yarn test
cd ../../packages/coloring && yarn test
```

Expected: all pass. Report the actual counts — do not claim success without reading the output.

- [ ] **Step 3: Exercise the dialog in the running app**

Start the dev server, open a book that has intro pages, click an intro page to open the preview, then press Regen.

Verify, without generating an image:
1. The dialog opens with "Trang tựa có hình" selected and the box filled with the title prompt, quoting this book's real title.
2. Clicking "Trang chữ thuần" swaps the box to the text prompt, which names no book title.
3. Clicking back to "Trang tựa có hình" restores the title prompt without a visible reload (it is cached).
4. "Khôi phục mặc định" is disabled until the box is edited, and restores the *current* variant's default.

Note: generating actually requires Redis plus a running worker; if `REDIS_URL` is set with no Redis running the request hangs. Steps 1-4 need neither.

- [ ] **Step 4: Report the outcome**

State plainly which of the four dialog checks passed and which did not. If any failed, stop and report rather than patching over it.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| New builder `intro-regen-prompt.ts` with the stated signature | 1 |
| No brand variable; copyright copied from source | 1 (prompt bodies) |
| Title prompt text | 1 |
| Text prompt text | 1 |
| `GET /api/intro-regen-prompt` | 2 |
| `/api/page-regen-prompt` untouched | Global constraint; no task modifies it |
| Two-button variant switch, defaulting to `title` | 3 |
| Per-variant default cached after first fetch | 3, Step 2 + Step 3 |
| Refetch only on an explicit click of the other variant | 3, Step 6 |
| Worker unchanged | Global constraint; no task touches it |
| Test: both variants under the KingCong budget | 1, Step 1 |
| Test: title/subtitle inlined, omitted when blank | 1, Step 1 |
| Test: `changePercent` default 55 | 1, Step 1 |
| Test: text variant names neither title nor subtitle | 1, Step 1 |
| Test: neither variant carries the KDP frame | 1, Step 1 |
| Route test: variant handling, fallback, 404 | 2, Step 1 |

No spec requirement is unassigned.

**Type consistency:** `IntroPageVariant` is defined in Task 1 and imported by name in Task 2. Task 3 deliberately declares its own structurally identical `IntroVariant` to avoid importing server-core into client code — this divergence is intentional and documented in both places. `buildIntroRegenPrompt` keeps one signature throughout. `defaultPrompts` / `activeDefault` / `loadPrompt` / `variant` are introduced in Task 3 Steps 2-3 and used consistently in Steps 4-7.

**Deviation from the spec, deliberate:** the spec said the route "loads title and subtitle for that book"; the implementation skips the query for the text variant, which needs neither, and 400s when the title variant is called without a `bookId`. This is strictly narrower and is covered by tests.
