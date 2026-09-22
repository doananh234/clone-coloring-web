import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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

import { IntroActionsRow } from "./intro-actions-row";
import type { BookColoringPage } from "../../data/types";

const page: BookColoringPage = { id: "sp1", url: "/s1.png" };

describe("IntroActionsRow — a failed variant switch must never leave a submittable box holding the other variant's text", () => {
  beforeEach(() => {
    httpGet.mockReset();
    httpPost.mockReset();
    httpPut.mockReset();
  });

  it("clears the box, keeps the previous variant selected, and disables submit when the fetch for the new variant fails", async () => {
    httpGet.mockResolvedValueOnce({ prompt: "TITLE RULES — illustration + lettering" });
    render(<IntroActionsRow bookId="b1" summaryPages={[page]} page={page} />);

    // Open the dialog on the default "title" variant.
    fireEvent.click(screen.getByRole("button", { name: /Regen/ }));
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveValue("TITLE RULES — illustration + lettering"));

    const titleBtn = screen.getByRole("button", { name: /Trang tựa có hình/ });
    expect(titleBtn.className).toContain("mo-btn--primary");

    // Switch to "text" — the fetch for that variant's prompt fails.
    httpGet.mockRejectedValueOnce(new Error("network down"));
    fireEvent.click(screen.getByRole("button", { name: /Trang chữ thuần/ }));

    // Rendered in two places by design (Fix 1b): the pre-existing outside-the-dialog
    // banner, now painted over by the backdrop, plus the new inside-the-dialog one
    // that is actually visible to the operator.
    await waitFor(() =>
      expect(screen.getAllByText(/Không tải được prompt mặc định/).length).toBeGreaterThan(0),
    );

    // The box must not still hold the title rule set (the wrong rule set for a
    // text page) — it must be empty, which blocks submission via the existing
    // `!promptText.trim()` guard.
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Tạo bản xem trước/ })).toBeDisabled();

    // Selection must not have silently advanced to "text" while the box is empty
    // of that variant's real prompt — "title" (the last variant that actually
    // produced text in the box) stays highlighted.
    expect(titleBtn.className).toContain("mo-btn--primary");
    const textBtn = screen.getByRole("button", { name: /Trang chữ thuần/ });
    expect(textBtn.className).not.toContain("mo-btn--primary");
  });
});
