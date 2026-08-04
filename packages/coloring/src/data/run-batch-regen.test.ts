import { describe, it, expect } from "vitest";
import { runBatchRegen } from "./run-batch-regen";

describe("runBatchRegen", () => {
  it("runs the given indices sequentially in order", async () => {
    const order: number[] = [];
    await runBatchRegen(
      [2, 0, 5],
      async (i) => {
        order.push(i);
      },
      () => {},
    );
    expect(order).toEqual([2, 0, 5]);
  });

  it("does not start the next page until the previous resolves", async () => {
    const events: string[] = [];
    let release: (() => void) | null = null;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    const promise = runBatchRegen(
      [0, 1],
      async (i) => {
        events.push(`start-${i}`);
        if (i === 0) await gate;
        events.push(`end-${i}`);
      },
      () => {},
    );
    // Let the first page start and block on the gate.
    await Promise.resolve();
    expect(events).toEqual(["start-0"]);
    release!();
    await promise;
    expect(events).toEqual(["start-0", "end-0", "start-1", "end-1"]);
  });

  it("skips a failing page and continues, reporting ok/err split", async () => {
    const { ok, err } = await runBatchRegen(
      [0, 1, 2],
      async (i) => {
        if (i === 1) throw new Error("boom");
      },
      () => {},
    );
    expect(ok).toEqual([0, 2]);
    expect(err).toEqual([1]);
  });

  it("reports progress after each page with the correct ok flag", async () => {
    const calls: Array<{ done: number; index: number; ok: boolean }> = [];
    await runBatchRegen(
      [7, 8],
      async (i) => {
        if (i === 8) throw new Error("nope");
      },
      (done, index, ok) => calls.push({ done, index, ok }),
    );
    expect(calls).toEqual([
      { done: 1, index: 7, ok: true },
      { done: 2, index: 8, ok: false },
    ]);
  });
});
