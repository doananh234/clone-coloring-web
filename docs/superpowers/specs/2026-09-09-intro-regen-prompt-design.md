# Intro-page regen prompt — shorten and split by variant

Date: 2026-09-09
Status: approved, ready for planning

## Problem

Clicking Regen on an intro page ([`IntroActionsRow`](../../../packages/coloring/src/screens/books/intro-actions-row.tsx))
prefills its editable box from `GET /api/page-regen-prompt`, which returns
`buildPageRegenPrompt({ frame: frameInstruction() })`. That builder is written for
**interior** pages: it says "keep the SAME scene, composition, characters, objects
and camera angle" and appends the KDP frame instruction. For an intro page — a
title page, a copyright/legal page, a table of contents, a dedication — this is
both too generic and actively wrong (an intro page must not get a KDP colouring
frame, and "preserve the scene" is meaningless on a text-only page).

A hand-written prompt already runs in the Diaflow flow and produces good results,
but it is verbose: it makes the model classify the page itself and then carries
**both** rule sets on every call, so roughly half of every request is text the
model must read and discard.

Measured on the current prompt:

| Section | Chars | Used when |
|---|---:|---|
| Header + STEP 1 (self-classification) | 1,059 | always |
| RULE SET A (title page) | 1,575 | only variant A |
| RULE SET B (text page) | 1,373 | only variant B |
| **Total** | **4,007** | |

At 4,007 chars the prompt is already over KingCong's **4,000-char limit**, before
counting the decorative `═══` rules in the original (roughly 300 more) or the fact
that KingCong itself counts a newline as CRLF.

KingCong does not reject an over-long prompt — `capPrompt()` in
`image-provider-kingcong.ts` **silently truncates** it, keeping the head and
cutting at the last line break. For this prompt the truncated tail is **RULE SET B
plus the closing REMINDER**. So when the source page is a text page, the rules
governing it can be cut off before the request is sent, leaving the model with
STEP 1 and RULE SET A — the rule set that tells it to draw an illustration. Since
KingCong is first in the `IMAGE_FALLBACK_PROVIDERS` chain, this is the default
path.

Shortening is therefore a correctness fix, not a tidiness one: it is the likely
cause of text-only intro pages coming back with artwork added.

## Goals

- One prompt per variant, containing only the rules that apply.
- Fit comfortably under KingCong's 4,000-char limit.
- Preserve the behaviour of the Diaflow prompt that already works.
- Keep the box editable: the default is a starting point, not a cage.

## Non-goals

- **Do not touch `buildPageRegenPrompt()`.** Interior regen and the clone
  reproduce helper keep their current prompt, unchanged and untested by this work.
- No change to the worker's regen handler.
- No new provider, model, or queue behaviour.

## Design

### 1. New builder — `packages/server-core/src/ai/prompts/intro-regen-prompt.ts`

```ts
export type IntroPageVariant = "title" | "text";

export interface IntroRegenPromptOptions {
  variant: IntroPageVariant;
  /** book.title — inlined so the model spells it correctly. */
  title?: string;
  /** book.subtitle — the line is omitted entirely when absent. */
  subtitle?: string;
  /** Variation budget for the title variant. Default 55. */
  changePercent?: number;
}

export function buildIntroRegenPrompt(options: IntroRegenPromptOptions): string;
```

Pure, like its neighbours: no env reads, no DB access, no frame instruction. The
caller supplies the book fields.

`variant: "text"` ignores `title`, `subtitle` and `changePercent` — a text page is
a faithful reproduction, and naming the book title near a copyright page invites
the model to draw it in.

### 2. No brand variable

The Diaflow prompt substitutes `{{trigger.brand_info}}` into the copyright line
(variant A) and over the publisher name (variant B). That variable has no
equivalent here: `Book` has no relation to `Brand` (see `schema.prisma`), the
brand is selected on `CloneJob`, and reaching it would mean a lookup back through
`CloneJob.resultBookId`.

It is not needed. An intro page stored on a `Book` was produced by the clone
pipeline **with the brand already rendered into the image**. So the prompt says
"reproduce the copyright line word-for-word from the source image" instead. This
is simpler *and* safer than the original: there is no longer a way to substitute
the wrong brand.

Title and subtitle are still inlined from the DB, because quoting the exact string
measurably helps image models spell it.

### 3. Prompt text — variant "title" (~1,318 chars)

```
This is the INTRO / TITLE page of a coloring book - not a printed cover, and not
a page meant to be colored in. Redraw it as a refreshed variation (~{pct}%
change). Output must be 1 single frame, never a split panel or grid.

TEXT - HIGHEST PRIORITY. Every word exactly as written, correctly spelled, fully
legible, nothing cropped or overlapped:
- Title: "{title}"
- Subtitle: "{subtitle}"
- Copyright line: reproduce it word-for-word from the source image.
Add no other words, taglines or placeholder text. Keep the original lettering
treatment: same font style and weight, same outlined / bubble-letter look, same
relative size and position.

KEEP: the vertical order (title top, illustration middle, descriptive text below,
copyright bottom); generous white margins on all four sides, artwork must NOT
bleed to the edges; black-and-white / grayscale only; the illustration's art
style, rendering technique and level of shading; its subject and theme.

CHANGE: the characters' pose, viewing angle and arrangement; the props and
decorative elements around them; background details, theme intact.

DO NOT: reword or shorten any text; drop the copyright line; add color, a
barcode, an ISBN or a QR code; go full-bleed; flatten the illustration into blank
line art with empty interiors.
```

The `- Title:` and `- Subtitle:` lines are dropped when the corresponding field is
empty.

### 4. Prompt text — variant "text" (~1,123 chars)

```
This is a text-only INTRO page of a coloring book (copyright, legal notice, table
of contents, dedication, or "this book belongs to"). Reproduce it faithfully -
this is NOT a creative variation, change as little as possible. Output must be 1
single frame.

TEXT - HIGHEST PRIORITY. Reproduce every text block from the source image: same
wording, same order, same position, correctly spelled and fully legible. Do not
omit, shorten, summarise or rephrase any sentence, including long legal
paragraphs. Keep website URLs, email addresses and social handles
character-for-character. Add no new words, headings or taglines.

KEEP: plain white page, black text, generous margins on all four sides; text
blocks centered and stacked vertically with the same spacing; font family,
weight, alignment and relative sizes; any logo or icon at its original position
and size.

DO NOT: add a book title, subtitle or book name anywhere; add any illustration,
character, animal, room, scene or background artwork; add a decorative frame,
border or ornamental divider; convert any part into line art; reword or remove
the legal paragraphs.
```

### 5. Route — `GET /api/intro-regen-prompt`

New route, `apps/admin/src/app/api/intro-regen-prompt/route.ts`.

Query params: `variant` (`title` | `text`, default `title`) and `bookId`.
Loads `title` and `subtitle` for that book, calls the builder, returns
`{ prompt }` — the same response shape the dialog already consumes.

`/api/page-regen-prompt` is left exactly as it is: it still serves interior regen.

### 6. UI — `IntroActionsRow`

The regen dialog gains a two-button segmented control above the prompt box:
**"Trang tựa có hình"** (`title`) and **"Trang chữ thuần"** (`text`), defaulting to
`title`. Selecting a variant refetches the box from the new route and replaces its
contents.

Refetch discards operator edits, so the switch is only wired to an explicit click
on the *other* variant — clicking the already-selected one does nothing.

The per-variant default is cached in component state after its first fetch, the
way `defaultPrompt` is cached today, so toggling back and forth does not refetch.

### 7. Worker — unchanged

`runRegen` already prefers `payload.promptOverride` over the built prompt, and the
dialog always sends the box contents. Nothing to change.

Known gap, accepted: if the prefill fetch fails, the operator can submit an empty
box, and the worker falls back to `buildPageRegenPrompt()` — the interior prompt —
on an intro page. This is pre-existing behaviour and out of scope here; the
dialog already surfaces a "Không tải được prompt mặc định" error when the fetch
fails.

## Decisions that differ from the original request

**Lettering is locked, not free.** The first framing of this work allowed the
model to restyle the lettering while preserving the wording. The shipped Diaflow
prompt instead pins the lettering treatment, and this design follows it: intro
title lettering usually has to match the cover, and image models frequently
misspell text they are asked to redraw in a new style. The ~55% variation budget
is spent entirely on the illustration (pose, viewing angle, props, background),
which is where change is safe.

**Variant "text" barely changes anything.** By the original prompt's own
classification, a "this book belongs to" page is a *text* page, and text pages are
faithful reproductions. Regenerating one therefore yields a near-identical page,
not a 50–60% variation. This is deliberate and matches current behaviour. If
"belongs to" pages should instead be redesigned, that needs a third variant and is
not covered here.

## Testing

Co-located `intro-regen-prompt.test.ts`, following the pattern of
`page-regen-prompt.test.ts`:

- Both variants stay under 4,000 chars counting newlines as 2 (the KingCong
  budget). This is the regression that motivated the work, so it is pinned.
- `variant: "title"` inlines the title and subtitle inside quotes.
- The subtitle line is absent when `subtitle` is undefined or blank; likewise the
  title line.
- `changePercent` appears in the title prompt; it defaults to 55.
- `variant: "text"` contains neither the title nor the subtitle string, even when
  both are passed.
- Neither variant contains the KDP frame instruction.

Route test alongside the existing `regen/route.test.ts` pattern: `variant=text`
returns the text prompt, an unknown or missing `variant` falls back to `title`, and
a missing book returns 404.

## Risks

- **Operator picks the wrong variant.** Choosing `title` on a copyright page could
  add an illustration to it. Mitigated by the labels naming the visible difference
  ("có hình" vs "chữ thuần") and by the box staying editable. The previous design
  had the same failure mode, decided by the model rather than the operator.
- **Shorter prompt, weaker adherence.** Cutting ~50% of the text could soften the
  model's compliance on the surviving rules. The cuts removed the classification
  step and the non-applicable rule set, not constraints — every KEEP / CHANGE /
  DO NOT line from the matching rule set is retained — so this is expected to be
  neutral or positive, but it is worth eyeballing the first few regens.
