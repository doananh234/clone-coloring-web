import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const httpGet = vi.fn();
const httpPost = vi.fn();
const httpPut = vi.fn();
vi.mock("@vx/core-uikit/api", () => ({
  httpGet: (...a: unknown[]) => httpGet(...a),
  httpPost: (...a: unknown[]) => httpPost(...a),
  httpPut: (...a: unknown[]) => httpPut(...a),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { PageBatchSelect } from "./page-batch-select";
import type { BookColoringPage } from "../../data/types";

/** Ids deliberately unlike the positions, so an index/id mix-up cannot pass. */
const pages: BookColoringPage[] = [
  { id: "aaa", url: "/p1.png" },
  { id: "bbb", url: "/p2.png" },
  { id: "ccc", url: "/p3.png" },
];

const selectPage = (n: number) => fireEvent.click(screen.getByAltText(`Trang ${n}`));
const deleteBtn = () => screen.getByRole("button", { name: /Xoá đã chọn/ });
const putBody = () => httpPut.mock.calls[0][1] as { coloringPages: { id: string }[] };

describe("PageBatchSelect — bulk delete", () => {
  beforeEach(() => {
    httpGet.mockReset();
    httpPost.mockReset();
    httpPut.mockReset();
    httpPut.mockResolvedValue({});
    vi.stubGlobal("confirm", vi.fn(() => true));
  });

  it("deletes the pages the operator ticked, addressed by id rather than position", async () => {
    render(<PageBatchSelect bookId="b1" pages={pages} cloneJobId="job1" />);
    selectPage(1);
    selectPage(3);

    await act(async () => { fireEvent.click(deleteBtn()); });

    await waitFor(() => expect(httpPut).toHaveBeenCalledTimes(1));
    expect(putBody().coloringPages.map((p) => p.id)).toEqual(["bbb"]);
  });

  it("drops the selection afterwards, so it cannot point at pages that shifted up", async () => {
    render(<PageBatchSelect bookId="b1" pages={pages} cloneJobId="job1" />);
    selectPage(1);
    await act(async () => { fireEvent.click(deleteBtn()); });

    // Selection is a Set of INDICES; every page after a deleted one shifts down,
    // so keeping it would leave the ticks on the wrong pages.
    await waitFor(() => expect(deleteBtn()).toBeDisabled());
  });

  it("writes nothing when the operator dismisses the confirm", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    render(<PageBatchSelect bookId="b1" pages={pages} cloneJobId="job1" />);
    selectPage(1);

    // Button auto-tracks the promise the async handler returns (setPending
    // true/false), so even this early-return path updates state — flush it.
    await act(async () => { fireEvent.click(deleteBtn()); });

    expect(httpPut).not.toHaveBeenCalled();
  });

  it("stays disabled until something is selected", () => {
    render(<PageBatchSelect bookId="b1" pages={pages} cloneJobId="job1" />);
    expect(deleteBtn()).toBeDisabled();
  });
});
