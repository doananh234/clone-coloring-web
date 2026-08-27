/**
 * What the worker is doing RIGHT NOW, formatted for the job screens.
 *
 * The job list and detail used to render `currentStep`, which the worker sets
 * to the step that just FINISHED. A job spending 40 minutes inside the Diaflow
 * one-shot therefore displayed "trim-pdf" with an empty progress bar and no
 * ETA, and every operator read that as a hang. `runningStep` / `runningSince` /
 * `runningBudgetSec` are published by withRetry precisely so this can say
 * "reproduce · 16/40 phút" instead.
 *
 * Pure, so the formatting is testable without rendering anything.
 */
export interface RunningStepView {
  step: string;
  /** null when runningSince is absent or unparseable — show the step, no clock. */
  elapsedSec: number | null;
  budgetSec: number | null;
  /** 0..100, or null when there is nothing to measure against. */
  percent: number | null;
  overBudget: boolean;
  label: string;
}

const MIN = 60;

function minutesLabel(elapsedSec: number): string {
  const m = Math.floor(elapsedSec / MIN);
  return m < 1 ? "<1 phút" : `${m} phút`;
}

export function describeRunningStep(
  runningStep: string | null | undefined,
  runningSince: string | null | undefined,
  budgetSec: number | null | undefined,
  now: number,
): RunningStepView | null {
  if (!runningStep) return null;

  const startedAt = runningSince ? Date.parse(runningSince) : NaN;
  if (Number.isNaN(startedAt)) {
    return {
      step: runningStep,
      elapsedSec: null,
      budgetSec: budgetSec ?? null,
      percent: null,
      overBudget: false,
      label: `${runningStep} · đang chạy`,
    };
  }

  // Browser and server clocks disagree; a step cannot have started in the
  // future, so clamp rather than render a negative age.
  const elapsedSec = Math.max(0, Math.round((now - startedAt) / 1000));
  const budget = budgetSec && budgetSec > 0 ? budgetSec : null;

  if (!budget) {
    return {
      step: runningStep,
      elapsedSec,
      budgetSec: null,
      percent: null,
      overBudget: false,
      label: `${runningStep} · đang chạy ${minutesLabel(elapsedSec)}`,
    };
  }

  const overBudget = elapsedSec > budget;
  const elapsedMin = Math.floor(elapsedSec / MIN);
  const budgetMin = Math.floor(budget / MIN);
  return {
    step: runningStep,
    elapsedSec,
    budgetSec: budget,
    percent: Math.min(100, Math.round((elapsedSec / budget) * 100)),
    overBudget,
    label: `${runningStep} · ${elapsedMin}/${budgetMin} phút${overBudget ? " — quá hạn" : ""}`,
  };
}
