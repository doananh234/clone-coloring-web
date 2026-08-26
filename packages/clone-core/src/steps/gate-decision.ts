import { planPageSelection, type SelectablePage } from "./plan-page-selection";

export type GateOutcome =
  | { outcome: "await-classify" }
  | { outcome: "await-fill"; lane: 2; interiorCount: number }
  | { outcome: "proceed"; lane: 1; interiorCount: number };

/**
 * Pure gate decision. Lives here (rather than in the worker) so the routing
 * rule is unit-testable without dragging in the worker's env/DB/Telegram
 * import chain.
 */
export function decideGateOutcome(
  pages: SelectablePage[],
  classifyConfirmed: boolean,
): GateOutcome {
  if (!classifyConfirmed) return { outcome: "await-classify" };
  const { interiorCount, lane } = planPageSelection(pages);
  return lane === 1
    ? { outcome: "proceed", lane: 1, interiorCount }
    : { outcome: "await-fill", lane: 2, interiorCount };
}
