/**
 * Pure planning for backfill-source-cover.ts — decides per book whether to swap
 * its cover for the source book's cover, and builds the new cover state. Kept
 * free of DB/R2 so it can be unit-tested.
 */
import { pickSourceCoverPage, type SourceCoverCandidate } from "@vx/clone-core/steps";
import {
  ensureSourceCandidate,
  addCandidate,
  selectCandidate,
  type CoverState,
} from "@vx/coloring/data/cover-candidates";

export type SourceCoverPlan =
  | { action: "apply"; sourceUrl: string; destKey: string }
  | { action: "skip"; reason: "already-done" | "no-source-page" };

type Rec = Record<string, unknown>;

export function planSourceCover(
  book: { id: string; data: unknown },
  jobPages: readonly SourceCoverCandidate[],
): SourceCoverPlan {
  const data = (book.data as Rec | null) ?? {};
  const candidates = Array.isArray(data.coverCandidates) ? (data.coverCandidates as Rec[]) : [];
  if (candidates.some((c) => c.origin === "original")) return { action: "skip", reason: "already-done" };

  const page = pickSourceCoverPage(jobPages);
  if (!page?.imageUrl) return { action: "skip", reason: "no-source-page" };

  const sourceUrl = page.imageUrl;
  const ext = sourceUrl.split("?")[0].match(/\.(png|jpe?g|webp)$/i)?.[1] ?? "png";
  // NOT assets/{id}/cover.png: finalize-cover wrote the AI cover there, and the
  // old cover must survive as a selectable candidate.
  return { action: "apply", sourceUrl, destKey: `assets/${book.id}/source-cover.${ext}` };
}

/**
 * Keep whatever cover the book has now as a candidate (seeded as origin
 * "source" if the book had no candidates yet), add the source book's cover as an
 * origin "original" candidate and select it — so the operator can switch back
 * from the book screen's Cover Candidates strip.
 */
export function withSourceCoverSelected(
  state: CoverState,
  sourceCoverUrl: string,
  newId: () => string,
  now: string,
): CoverState {
  const seeded = ensureSourceCandidate(state, newId, now).state;
  const id = newId();
  const added = addCandidate(seeded, { id, url: sourceCoverUrl, origin: "original", createdAt: now });
  const target = (added.coverCandidates ?? []).find((c) => c.url === sourceCoverUrl)!;
  return selectCandidate(added, target.id);
}
