import { planPageSelection, type SelectablePage } from "./plan-page-selection";

export type GateOutcome =
  | { outcome: "await-classify" }
  | { outcome: "await-fill"; lane: 2; interiorCount: number }
  | { outcome: "proceed"; lane: 1 | 2; interiorCount: number };

/**
 * Pure gate decision. Lives here (rather than in the worker) so the routing
 * rule is unit-testable without dragging in the worker's env/DB/Telegram
 * import chain.
 *
 * `alreadySpent` answers "has this job already made its AI call?" — in the
 * worker, `ctx.isDone("reproduce")`. It matters because the Lane 2 park is a
 * PRE-SPEND decision: it exists to stop money being spent on a book that
 * cannot be built yet. Parking a job whose Diaflow call has already completed
 * saves nothing and strands purchased work in `awaiting-fill`, where nothing
 * un-parks it automatically.
 *
 * That case is real, not hypothetical: rows created before this change had the
 * gate sitting AFTER `reproduce`, so `classifyConfirmed === true` on them
 * implies the spend is already done. Any such row re-entering the processor
 * (stale-job reconciler, /retry, or an operator confirming a row that has been
 * sitting in `awaiting-classify`) must be allowed through to
 * create-book/generate-cover.
 *
 * `lane` and `interiorCount` are still reported when the park is suppressed —
 * callers persist them for queue filtering and reporting either way.
 */
export function decideGateOutcome(
  pages: SelectablePage[],
  classifyConfirmed: boolean,
  alreadySpent = false,
): GateOutcome {
  if (!classifyConfirmed) return { outcome: "await-classify" };
  const { interiorCount, lane } = planPageSelection(pages);
  if (lane === 1) return { outcome: "proceed", lane: 1, interiorCount };
  if (alreadySpent) return { outcome: "proceed", lane: 2, interiorCount };
  return { outcome: "await-fill", lane: 2, interiorCount };
}
