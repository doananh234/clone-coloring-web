/**
 * First-time / manual login for the KingCong image provider (worker-side).
 *
 * KingCong login is Google OAuth (not scriptable), so you log in ONCE by hand
 * in a persistent Playwright profile; this snapshots the session cookie into
 * KINGCONG_SESSION_FILE. After that, image-provider-kingcong.ts can silently
 * re-mint cookies from the same profile until it logs out.
 *
 * Run:  node --env-file=.env --import tsx src/scripts/kingcong-login.ts
 * (requires: yarn add -D playwright && npx playwright install chromium)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { chromium } from "playwright";

const BASE_URL = (process.env.KINGCONG_BASE_URL || "https://kingcongstudio.com").replace(/\/$/, "");
const IMAGE_PAGE = process.env.KINGCONG_IMAGE_PAGE_URL || `${BASE_URL}/ai/image`;
const USER_DATA_DIR = resolve(process.env.KINGCONG_USER_DATA_DIR || ".kingcong-profile");
const SESSION_FILE = resolve(process.env.KINGCONG_SESSION_FILE || ".kingcong-session.json");

async function main(): Promise<void> {
  // Google blocks OAuth in automation-controlled browsers ("This browser or app
  // may not be secure"). Using the REAL Chrome channel + stripping the
  // automation flags makes the manual Google login work in most cases. If it
  // still blocks: log into KingCong in your normal Chrome, copy the cookie
  // (DevTools → Application → Cookies, or "Copy as cURL"), and either set
  // KINGCONG_COOKIE or paste it into the session file — no browser needed.
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    channel: "chrome", // real Chrome, not bundled Chromium
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(IMAGE_PAGE, { waitUntil: "networkidle" });

  console.log("\n👉 Đăng nhập KingCong (Google) trong cửa sổ vừa mở.");
  console.log("   Khi đã vào được /ai/image, quay lại đây nhấn Enter.\n");
  const rl = createInterface({ input: stdin, output: stdout });
  await rl.question("Nhấn Enter sau khi đăng nhập xong... ");
  rl.close();

  const cookies = await context.cookies(BASE_URL);
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  if (!/PHPSESSID=/.test(cookieHeader)) {
    throw new Error("Không thấy PHPSESSID — có vẻ chưa đăng nhập thành công.");
  }

  await mkdir(dirname(SESSION_FILE), { recursive: true });
  await writeFile(
    SESSION_FILE,
    `${JSON.stringify({ cookie: cookieHeader, source: "manual", updatedAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
  console.log(`\n✅ Lưu session: ${SESSION_FILE}`);
  console.log(`✅ Profile Playwright: ${USER_DATA_DIR} (dùng cho auto-relogin)`);
  await context.close();
}

main().catch((err) => {
  console.error("❌", err);
  process.exit(1);
});
