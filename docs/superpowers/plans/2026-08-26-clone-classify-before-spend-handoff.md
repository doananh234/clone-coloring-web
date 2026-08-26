# Clone pipeline — classify before spend — Handoff

**Date:** 2026-08-26
**Branch:** `worktree-clone-classify-before-spend` (pushed to origin)
**Forked from:** `de8d54f` (= `origin/main` at the time)
**Status:** Implementation complete and reviewed. NOT merged. NOT run end-to-end.

Written to hand this work between machines. Read "Pick up here" first if you
just want to continue.

---

## Pick up here

```bash
git fetch origin
git checkout worktree-clone-classify-before-spend
yarn install
```

Then bring over the two gitignored env files from the other machine (they are
not and must not be in git):

- `apps/admin/.env.local`
- `apps/worker/.env`

Start the SSH tunnel as usual before running anything that touches the DB:

```bash
ssh -N -o ServerAliveInterval=30 -L 5432:localhost:5432 -L 6379:localhost:6379 ec2-user@3.216.170.208
yarn workspace @vx/admin dev
```

**Remember `localhost:5432` IS production while that tunnel is up.** Never run
`prisma db push`, `prisma migrate`, or `prisma db seed` against it, and do not
start the worker against it casually — a local worker consumes production
BullMQ jobs.

---

## What this branch does

The clone pipeline used to pay first and decide later: `stepOneShot` sent the
whole source PDF to Diaflow, which redesigned every page; only afterwards were
pages classified, and only then did the operator gate open. Excluding a page
saved nothing, and correspondingly **no page had ever been excluded in
production**.

Now:

```
download ──▶ render ──────────────────────── free (PNG per page to R2)
                │
        ★ GATE — operator classifies cover/intro/interior, marks drops ★
                │
          count interior pages
             │              │
        ≥ 40 │              │ < 40
             ▼              ▼
   trim PDF to kept    park as `awaiting-fill`,
   pages, then         no provider call, no cost
   one-shot Diaflow ◀── spend starts only here
             │
   create-book ──▶ generate-cover
```

Dropped pages stay in `job.pages`, so the exported `Main book/` archive is
still the complete original source book. That was a separate bug the branch
also fixes: the old `excluded` flag removed pages from the archive too.

## Commits (21)

Tasks, in order: export archive fix → `excludedFromClone` split →
`planPageSelection` lane router → `stepTrimPdf` → one-shot consumes the trimmed
PDF and merges by original page number → gate moved and lanes routed → classify
route + `awaiting-fill` status + rerun bypass closed → gate UI counter and lane
banner. Then a fix wave for the final review's findings, then the spec
corrections.

`git log --oneline main..HEAD` for the full list.

## Verification state

| Package | Before | After |
|---|---|---|
| `@vx/clone-core` | 72 pass | **115 pass** |
| `@vx/coloring` | 83 pass | **87 pass** |
| `@vx/server-core` | 78 pass / 1 fail | 81 pass / **1 fail** |
| `@vx/admin` | not baselined | 103 pass / **3 fail** |

**The 4 remaining failures are pre-existing on `main`, not from this branch.**
Verified individually:
- `packages/server-core/src/ai/prompts/cover-source-bw-prompt-template.test.ts`
  asserts a prompt string (`/bottom title area/`) the template no longer
  contains — stale since the "compact prompts" commit.
- 3 in `apps/admin/src/app/api/books/[bookId]/source-covers/route.test.ts`,
  which throw `TypeError: Cannot read properties of undefined (reading
  'create')` because that file's Prisma mock is missing a model. This branch
  never touches `apps/admin/src/app/api/books/**`.

`yarn workspace @vx/worker test` exits 1 with "no test files" — expected. The
worker's only test was deliberately moved into `@vx/clone-core` so it would
actually execute (it previously did not run at all, because the worker's env
validation throws at import).

### What is NOT verified

**Nobody has run the pipeline end-to-end.** Everything above is unit tests plus
an HTTP smoke check that every page compiles and server-renders (200 on `/`,
`/jobs`, `/jobs/<id>`). The classify tab renders client-side, so the interior
counter and the lane banner have **never been seen by a human or a browser**.
That is the single biggest remaining risk and the first thing to do next.

## Do this first, on the other machine

1. **Look at the gate screen.** Start the admin app, open a job in
   `awaiting-classify`, and check that the thumbnail grid renders, the three
   classification buttons work, the interior counter updates as you toggle, and
   the banner switches between the green (Lane 1) and orange (Lane 2) messages.
   Job `7aeb2b0a-c3d1-43c5-9d2e-0dd145612d69` has 16 pages, so it is a Lane 2
   case and should show the orange banner.
   **Do not press Save or Confirm** unless you mean it — Save writes to a
   production job row, Confirm enqueues it for real.

2. **If you want a real end-to-end run, use a separate database.** Docker is
   installed. The tunnel occupies 5432 and 6379, so map the containers to other
   ports, point a scratch `.env` at them, `prisma db push` **against the local
   URL only**, seed one job from a small PDF, and run the worker with a stubbed
   image provider. This exercises gate → trim → lane with no AI cost and no
   production writes.

## Open questions — none of these are answered

1. **The saving is still unmeasured, and the spec's number is a ceiling not a
   forecast.** The "~14%" figure came from counting non-interior pages, but
   cover and intro pages are still sent for redesign — only operator-marked
   junk is skipped, and no operator has ever marked any. **Gate about 20 jobs,
   count `excludedFromClone: true` per book, and record the real rate before
   extrapolating to the 2,051-job backlog.** If it turns out to be 1–2 pages a
   book, the saving is ~3% and the case for this work rests instead on Lane 2
   routing and the export-archive fix.

2. **`isPublic` contradicts the ≥40 rule.** 118 of 124 books are `isPublic:
   true` and 51 of those have fewer than 40 interior pages — which should be
   impossible if 40 interiors are required to publish. Either the flag means
   something narrower than "published", or those books predate the rule. This
   decides whether Lane 2 parking is a real saving or only a deferral.

3. **Lane 2's fill mechanism does not exist.** Roughly 62% of jobs land there
   and will simply park. Building it needs its own design. Note the un-park
   path that does exist: the Classify tab renders for `awaiting-fill`, so an
   operator can re-classify and re-confirm. `/rerun` deliberately rejects
   `awaiting-fill`.

## Decisions made on your behalf

Full reasoning is in the git history and the spec's corrections section. The
ones worth knowing:

- **`apps/worker/.env` was deleted from the working copy** because it held live
  Diaflow tokens, R2 keys and the production `DATABASE_URL` while `.gitignore`
  covered `.env.local`/`.env.prod` but **not a bare `.env`** — untracked and
  unignored, one `git add -A` from committing secrets. The file is intact on
  the office machine's main checkout.
- **That `.gitignore` gap is still open in the repo.** Your main checkout
  already has the fix (`.env` on line 5) but **has not committed it**. Commit
  it. It was deliberately not added on this branch to avoid conflicting with
  your uncommitted change.
- **The PATCH response of the classify route stays `{ ok, confirmed }`** —
  `interiorCount`/`lane` are persisted to `job.data` but not returned, because
  nothing consumes them and the UI must compute the count live before saving.
- **One ruling I made was wrong and the final review caught it.** I judged the
  `SourceBook.oneShotPages` cache safe after checking cross-job sharing and
  `/rerun`. I missed `/retry`, which does not clear the cache — so a job whose
  provider call succeeded but whose R2 mirroring failed could replay a
  full-book cache through a shorter kept-page map and silently misplace every
  page's artwork. Fixed with `oneShotKeptPageNumbers` + discard-on-mismatch.

## Known cost trade accepted in the fix wave

Discarding a mismatched one-shot cache means an affected unfinished job re-runs
Diaflow once. A legacy cache on a legacy job (neither side has a kept-page map)
is treated as consistent and reused, so pre-branch rows are not affected. Two
sibling jobs over one SourceBook with different kept-sets would now invalidate
each other's cache — measured 1:1 in production today (2,197 jobs, 2,197
distinct source books), so no current impact.

## Machine state left behind (office machine)

- Worktree at `.claude/worktrees/clone-classify-before-spend`, branch pushed.
- Two dev servers were running and have been stopped: port 3000 served the
  main checkout (old code), port 3001 served the worktree (this branch). If
  anything is still listening, they are safe to kill.
- The SSH tunnel (ssh.exe PID 6852) was left running — it was already up before
  this session started.
