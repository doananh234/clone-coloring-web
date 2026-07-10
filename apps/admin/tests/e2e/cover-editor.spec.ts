import { test, expect } from "@playwright/test";

const TEST_BOOK_ID = process.env.E2E_TEST_BOOK_ID;
test.skip(!TEST_BOOK_ID, "E2E_TEST_BOOK_ID env not set");

test("open editor, edit title, save, book cover updates", async ({ page }) => {
  await page.goto(`/books/${TEST_BOOK_ID}`);
  await page.getByRole("button", { name: /edit cover/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const titleInput = page.getByPlaceholder("Title text");
  await titleInput.fill("Playwright Test Cover");
  await expect(titleInput).toHaveValue("Playwright Test Cover");

  await page.getByRole("button", { name: /save cover/i }).click();
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 60_000 });

  // Book row's cover image should have refreshed (URL contains bookId).
  await expect(page.locator("img").filter({ hasText: "" }).first()).toHaveAttribute(
    "src",
    new RegExp(TEST_BOOK_ID!),
  );
});
