# Clone pipeline — classify before spend — Design

**Date:** 2026-08-26
**Status:** Implemented — see "Corrections found during implementation" at the end.
This document is kept as written, with its errors marked rather than edited away,
because several of them caused real defects that the final review caught.

## Problem

The clone pipeline pays for AI image generation **before** it knows which pages
it will keep. `stepOneShot` sends the whole source PDF to Diaflow, which
redesigns every page; only afterwards does `classifyPage` label pages
cover/intro/interior, and only after that does the operator gate open. By then
the money is spent.

This matters now because of scale: **2,051 CloneJobs are `pending`** against
112 completed. At ~44 pages per book that backlog is roughly **90,000 image
generations**. Every wasted call per book is ~2,000 wasted calls across the
backlog.

## Measurements (production DB, 2026-08-26)

All figures below were read directly from prod; they are the basis for every
decision in this document.

| Metric | Value |
|---|---|
| CloneJob status | pending **2051**, reproduced 112, stashed 16, error 9, awaiting-classify 7, analyzed 2 |
| Books / pages kept | 124 books, 4,703 pages (min 0, median 42, max 72) |
| Pages redesigned by the 112 completed jobs | **4,580** |
| Source `totalPages` | min 11, **median 44**, max 79 (dense cluster at 43–49) |
| Pages with `pageType` set (60 recent jobs, 2,640 pages) | 104 — **96% empty** |
| Diaflow classification signals (same 2,640 pages) | isCover 234, isInterior 86, isIntro 10, **no signal 2,253 (85%)** |
| Non-interior pages per book, among the 64 books that had any signal | range 2–19, **median ~6** |
| Lane split (interior ≥ 40 vs < 40) | Lane 1 ≤ 42, **Lane 2 ≥ 70 (≥62%)** |
| Misroute rate if `totalPages` were used as a proxy for interior count | **25/112 = 22%** |
| Pages generated then discarded (`status:"error"`, 128-job sample) | **92** |
| Pages carrying `excluded: true` (128-job sample) | **0** |
| Retries, last 400 jobs (2026-06-29 → 2026-08-11) | 10 total, all on `reproduce`; top cause Diaflow 409 session-creation ×5 |
| `isPublic` books | 118/124 public — **51 of them have interior < 40** |

Two caveats carried forward:

- The "median ~6 non-interior pages" is measured only on books where Diaflow
  emitted a signal. 48 of 112 books report zero, which is missing data rather
  than a clean book. The true rate is unknown until the operator gate produces
  a real baseline.
- The `isPublic` figure contradicts the stated rule that a book needs ≥40
  interior pages to publish. Unresolved — see Open questions.

## Root cause

`stepOneShot` redesigns page *i*, then classifies it inside the same loop
(`one-shot.ts:234`). The operator gate sits after that, between reproduce and
create-book (`clone-job-processor.ts:99`). So classification and human review
are both downstream of the only expensive step, and neither can prevent spend.
Consistently with that, **no page in the sample has ever been excluded** — the
gate is rubber-stamped because excluding a page there saves nothing.

## Decisions

1. **Move the operator gate ahead of all AI spend** — between `render` and
   `reproduce`. `stepRender` already produces a PNG of every page on R2 at zero
   token cost, so the gate has everything it needs.
2. **The operator classifies all three groups** — cover / interiorIntro /
   interior — plus marks pages to drop from cloning. Replaces the Diaflow
   signal, which is absent on 85% of pages.
3. **No page cap.** Source books keep their length: 47 pages in → 47 pages out,
   79 → 79. Only junk pages are dropped. (Product decision; see W10.)
4. **Lane routing at the gate.** Interior ≥ 40 → Lane 1, proceed. Interior < 40
   → Lane 2, **stop before calling Diaflow** and park the job until the
   page-generation mechanism is built. Lane 2 is explicitly lower priority.
5. **Dropping a page is clone-scoped only.** The exported "Main book" must
   still contain the complete original — cover, intro, and interior. Exclusion
   controls what Diaflow is asked to redesign, nothing else.

## Target pipeline

```
download ──▶ render ─────────────────────────────────── no AI cost
                │  renders every page to PNG on R2
                ▼
        ★ GATE — operator reviews the thumbnail grid ★
                │  assigns cover / interiorIntro / interior, marks drops
                ▼
          count interior pages
             │             │
        ≥ 40 │             │ < 40
             ▼             ▼
   build trimmed PDF    Lane 2: park, spend nothing,
   (kept pages only)    await the fill mechanism
             │
             ▼
   one-shot Diaflow ─────────────────────────────────── spend starts here
             │
             ▼
   create-book ──▶ generate-cover
```

The gate keeps the existing `awaiting-classify` status; it simply fires
earlier. Resume works as it does today: the classify route sets
`classifyConfirmed` and re-enqueues, and `ctx.isDone()` skips the completed
steps.

## Data model

**`job.pages[].pageType`** — unchanged shape (`"cover" | "interiorIntro" |
"interior"`), new provenance: assigned by the operator at the gate instead of
derived from Diaflow output. `classifyPage()` stays, demoted to seeding the
gate UI's default selection (page 1 = cover, rest = interior) so the operator
edits rather than starts blank.

**`job.pages[].excludedFromClone: boolean`** — new field replacing the
overloaded `excluded`. Splitting the name is what makes decision 5 enforceable:
today one flag drives both "skip this in the clone" and "omit this from the
original-book export", and those must diverge. Migration is free — **0 pages in
the 128-job sample carry `excluded: true`** — but confirm against the full
table before dropping the old field.

**`job.data.interiorCount: number`** — computed at the gate, the value lane
routing keys on. Recorded rather than recomputed so a later change to the
threshold does not silently re-route parked jobs.

**`job.data.lane: 1 | 2`** — the routing decision, persisted for queue filtering
and reporting.

**New CloneJob status `"awaiting-fill"`** — Lane 2 parking state. Distinct from
`awaiting-classify` (waiting on a human) and from `error` (nothing failed), so
the backlog can be counted and drained separately once Lane 2 is built.

## Components to change

| File | Change |
|---|---|
| `apps/worker/src/processor/clone-job-processor.ts:99` | Move the gate block to sit between `stepRender` and `stepOneShot`; after `classifyConfirmed`, compute `interiorCount`, persist `lane`, and return early with `awaiting-fill` when interior < 40. |
| `packages/clone-core/src/steps/` | New `stepTrimPdf` — read the source PDF, copy only non-dropped pages into a new PDF via `pdf-lib`, upload to `assets/clone-jobs/{jobId}/source-trimmed.pdf`, record the kept-page index map on `job.data`. |
| `packages/clone-core/src/steps/one-shot.ts:234` | Feed the trimmed PDF. Remove the in-loop `classifyPage` call — classification now precedes generation. Map Diaflow's output back onto original page numbers through the kept-page index map, since the trimmed PDF renumbers pages. |
| `packages/server-core/src/book-export/build-export-zip.ts:54` | **Delete the `!p.excluded` filter.** `Main book/` must be built from every page in `job.pages`. The cover/intro/interior split now uses operator-assigned `pageType`, which also fixes today's wrong split (96% of pages have no `pageType`, so `Book cover` falls back to `included[0]` and `Book intro` is nearly always empty). |
| `packages/clone-core/src/steps/create-book.ts:104` | Keep filtering dropped pages out of the clone Book — same behaviour, switched to `excludedFromClone`. |
| `apps/admin/src/app/api/clone/[jobId]/classify/route.ts` | Already accepts `pages[].pageType`, `pages[].excluded`, and `confirm`. Rename the field, and return `interiorCount` + `lane` so the UI can show the routing outcome before the operator confirms. |
| Admin gate UI | Thumbnail grid over `job.pages[].imageUrl`, three-way classification per page, drop toggle, live "interior = N" counter with the Lane 1/Lane 2 consequence stated before confirm. |
| `packages/server-core/package.json` | Add `pdf-lib` (present in `apps/admin` only today). |

## Expected saving

- **Upper bound, not a forecast:** only pages the operator marks *dropped* stop
  costing money. Cover and intro pages are still sent to Diaflow — `create-book`
  needs their redesigned versions for `coverUrl` and `summaryPages`. So the
  measured "median ~6 non-interior pages per book" is a **ceiling** on the
  saving (~14% of a 44-page book), not the expected value: it bundles cover and
  intro together with genuine junk, and only the junk is dropped.
- **The real number is unknown today** and cannot be derived from existing data,
  because no page has ever been excluded (0 in the 128-job sample) and 85% of
  pages carry no classification signal. The gate produces the first trustworthy
  baseline. **Measure the drop rate over the first ~20 gated jobs before
  extrapolating to the backlog** — if operators drop only 1–2 pages per book,
  the saving is ~3%, and the case for this work rests instead on Lane 2
  routing, correct `pageType` for export, and unblocking W3/W6.
- **Not a saving, a deferral:** ≥62% of jobs park in Lane 2 and spend nothing
  until that lane is built. This is cash-flow control, and only becomes real
  savings if sub-40 books are genuinely unpublishable — which the `isPublic`
  data currently contradicts.

## Findings backlog

Evidence-backed list from the audit. Status is relative to this design.

| # | Finding | Evidence | Status |
|---|---|---|---|
| W1 | Pages are redesigned before they are classified | `one-shot.ts:234` classifies inside the generation loop | Fixed here |
| W2 | Operator gate sits after the only expensive step, so review cannot prevent spend | `clone-job-processor.ts:99`; 0 pages ever excluded across 128 jobs | Fixed here |
| W3 | `withRetry` retries every error 5×, transient or not; `isRateLimitError()` is defined in `retry.ts` but called nowhere outside its own test | `retry.ts`; grep shows test-only usage | **Open — high** |
| W4 | Retry granularity is the step, not the page: one failed fetch re-runs `stepOneShot`. The `SourceBook.oneShotPages` cache covers most of it, but is only written after a fully successful session | `one-shot.ts` | Open |
| W5 | 92 pages were generated (and paid for) then discarded as `status:"error"` — ~1.8% of pages | 128-job sample | Open |
| W6 | `extractColoringStyle` runs once per job at `maxTokens: 20000`, with no cache and **no Langfuse `trace`** — so this cost is invisible in telemetry. Books from one brand/series share a style and are trivially cacheable | `clone-cover-deps.ts:64` | **Open — high** |
| W7 | Cover source page is picked with `Math.random()`; a bad pick means an operator-triggered regeneration. 7 books have consumed 17 source-cover jobs, up to 3 each | `generate-cover.ts:267` | Open |
| W8 | `stepFillInterior` generates N images in a loop and writes the DB once at the end — a failure on the last image re-generates all N, up to 5 times | `fill-interior.ts:114` vs `:145` | Open — Lane 2 |
| W9 | No per-step cost or timing telemetry; combined with W6 there is no way to answer "what does one book cost" from data | — | Open |
| W10 | 40 is a floor (`fill-interior` only adds) with no ceiling; 67/112 jobs exceed it by 505 pages = 11% of all pages | `fill-interior.ts` `DEFAULT_TARGET_INTERIOR` | **Dropped** — product decision: keep source length |
| W11 | Diaflow's classification signal is unusable for routing: 85% of pages carry no `isCover`/`isIntro`/`isInterior` at all | 2,640-page sample | Fixed here (operator replaces it) |
| W12 | `pageType` is empty on 96% of pages, so there is no classification baseline today | 2,640-page sample | Fixed here |
| W13 | `totalPages` cannot proxy for interior count: 22% of jobs would be routed to the wrong lane, and the densest page-count cluster (43–49) sits right on the boundary | 112-job sample | Fixed here |
| W14 | Lane 1 is the minority — ≥62% of jobs are Lane 2. Prioritising Lane 1 is right on difficulty, but it covers only about a third of the backlog | 112-job sample | Planning note |
| W15 | `excluded` strips pages from the **original-book export**, not just from the clone | `build-export-zip.ts:54` | Fixed here |

## Open questions

- **Does `isPublic` mean "published"?** 118/124 books are `isPublic: true` and
  51 of those have fewer than 40 interior pages, which contradicts the ≥40 rule
  for publication. Either the flag means something narrower, or those books
  predate the rule. This determines whether Lane 2 parking is a genuine saving
  or only a deferral — and whether the 51 books need attention.
- **One book has 0 pages** (`min kept pages = 0`). Not a cost issue; worth a
  look.
- **Lane 2 mechanism** — how sub-40 books reach 40 interiors is deliberately
  out of scope here and needs its own design.

## Out of scope

An earlier pass over the same code surfaced throughput and reliability issues —
`clone-jobs` pinned at `concurrency: 1`, a `lockDuration` of 60s against steps
that run 30–40 minutes, in-process retries that hold a worker slot while
sleeping, a reconciler that only runs at boot, an unwired Diaflow rate limiter,
and two enqueue sites that bypass `enqueueCloneJob`. None of these waste tokens,
so all are deferred. They are recorded in the conversation that produced this
document and should get their own design once cost is under control.

---

## Corrections found during implementation

The design above was written from static reading. Implementation and a
whole-branch review found eight places where it was wrong. All are fixed in
code; they are recorded here so the document does not mislead a later reader.

**1. "Resume works as it does today" was wrong for existing rows.**
The Target pipeline section reasoned only about jobs that stop *at* the gate.
It never considered the backlog whose `classifyConfirmed` was set by the OLD,
post-`reproduce` gate — for those rows, `classifyConfirmed === true` means the
provider **already ran**. Moving a gate from after the spend to before it
changes its meaning for every row that already passed the old one. Left
unhandled this parked already-paid jobs in `awaiting-fill` with nothing to
un-park them. Fixed: the Lane 2 park is now conditional on `!isDone("reproduce")`.

**2. The consumer inventory for the drop flag was incomplete.**
The Data model section named the read rule but never grepped for its consumers.
Four were missed: `fill-interior.ts`, the admin `create-book` route, the admin
`fill-interior` route, and `use-fill-interior.ts`. The first is the serious one
— `planFillInterior` counted dropped pages as interiors *and pooled them as
clone sources*, so it could pay to clone a page the operator had just dropped.
Fixed: a shared `isDroppedFromClone()` in `plan-page-selection.ts`, all four
migrated.

**3. The SourceBook one-shot cache was never reconciled with the trimmed PDF.**
W4 framed `SourceBook.data.oneShotPages` as a retry concern only. But the cache
records nothing about which original pages it covers, so a cache built under one
kept-set replayed through a different `keptPageNumbers` silently attributes every
result after the first divergence to the wrong page. Reachable via `/retry` on a
job whose provider call succeeded but whose R2 mirroring failed. Fixed:
`oneShotKeptPageNumbers` is persisted alongside the cache and a mismatch is
discarded loudly. A legacy cache with no map on a job with no map is treated as
consistent and reused.

**4. `awaiting-fill` was declared a first-class status but only registered as UI
metadata.** The shared `CloneJob.status` union in `@vx/server-core` never learned
about it. Fixed.

**5. `classifyPage()` could not be "demoted to seeding the gate UI".**
`@vx/coloring` cannot depend on `@vx/clone-core`, so the seed rule was inlined
there instead and `classifyPage` is now production-dead — retained only for its
tests. Either delete it or annotate it.

**6. The identity fallback `?? i + 1` in `stepOneShot` was unsafe.**
Correct as a legacy fallback when `keptPageNumbers` is absent, but when the array
is present and the provider returns more pages than were sent, out-of-range
indices collided with real page numbers. Fixed: returns `null` past the end and
the result is skipped with a warning.

**7. The legacy `useMultiStep` branch was left ungated, then left drop-blind.**
The old gate sat after BOTH branches, so removing it did not merely fail to add a
gate to the legacy path — it removed the one that path had. Fixed by hoisting
`stepRender` and the gate above the branch. Separately, `stepAnalyze` and
`stepReproduce` still iterated dropped pages; both now skip them.

**8. Lane 2 had no specified un-park path.**
One exists — the classify tab renders for `awaiting-fill`, so an operator can
re-classify and re-confirm — but it emerged rather than being designed. Note that
`/rerun` deliberately rejects `awaiting-fill` (its `allowedStatuses` are
`reproduced`, `error`, `stashed`).

### Still open

- **The saving is still unmeasured.** No page has ever been dropped in
  production, so the drop rate that determines this work's payoff remains
  unknown. Gate ~20 jobs, count `excludedFromClone: true` per book, and record
  the real rate here before extrapolating to the backlog.
- **The `isPublic` question above is unresolved.** 118/124 books are public and
  51 of those have fewer than 40 interior pages, which contradicts the ≥40
  publication rule that motivates Lane 2.
- **`stepTrimPdf` has no guard for an operator dropping every page.** Unreachable
  today because Lane 2 parks such a job first, but worth a guard.
