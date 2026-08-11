import type { CoverCandidate } from "./types";
// Re-export so server routes import the type + helpers from this one pure module
// (packages/coloring/src/data/types.ts is pure interfaces — safe on the server).
export type { CoverCandidate };

export interface CoverState {
  coverUrl?: string;
  coverCandidates?: CoverCandidate[];
  selectedCoverCandidateId?: string;
}

/** Seed the current cover (book.coverUrl) as an origin:"source" candidate if the
 *  list is empty and a coverUrl exists, selecting it. Returns the (possibly
 *  unchanged) state and the source/first candidate id (undefined if nothing to seed). */
export function ensureSourceCandidate(
  state: CoverState,
  newId: () => string,
  now: string,
): { state: CoverState; sourceId?: string } {
  const list = state.coverCandidates ?? [];
  if (list.length > 0) return { state, sourceId: list[0].id };
  if (!state.coverUrl) return { state, sourceId: undefined };
  const id = newId();
  const source: CoverCandidate = { id, url: state.coverUrl, origin: "source", createdAt: now };
  return {
    state: { ...state, coverCandidates: [source], selectedCoverCandidateId: id },
    sourceId: id,
  };
}

/** Append a candidate without changing the selection. Dedupes by url: if a
 *  candidate with the same url exists, the state is returned unchanged. */
export function addCandidate(state: CoverState, incoming: CoverCandidate): CoverState {
  const list = state.coverCandidates ?? [];
  if (list.some((c) => c.url === incoming.url)) return { ...state, coverCandidates: list };
  return { ...state, coverCandidates: [...list, incoming] };
}

/** Point selectedCoverCandidateId at `candidateId` and mirror its url onto coverUrl. */
export function selectCandidate(state: CoverState, candidateId: string): CoverState {
  const c = (state.coverCandidates ?? []).find((x) => x.id === candidateId);
  if (!c) throw new Error(`cover candidate ${candidateId} not found`);
  return { ...state, selectedCoverCandidateId: candidateId, coverUrl: c.url };
}

/** Remove a candidate. Refuses the currently-selected one. */
export function deleteCandidate(state: CoverState, candidateId: string): CoverState {
  if (candidateId === state.selectedCoverCandidateId) throw new Error("cannot delete the selected cover candidate");
  const list = state.coverCandidates ?? [];
  if (!list.some((c) => c.id === candidateId)) throw new Error(`cover candidate ${candidateId} not found`);
  return { ...state, coverCandidates: list.filter((c) => c.id !== candidateId) };
}
