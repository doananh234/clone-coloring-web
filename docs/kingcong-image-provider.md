# KingCong image provider — trạng thái & việc tiếp theo

> Paste toàn bộ file này vào Claude ở repo `new-admin-theme` để tiếp tục. Nó
> tự chứa: những gì ĐÃ xong + việc CÒN LẠI để đưa KingCong vào luồng sinh ảnh thật.

## Đã xong (typecheck 0 lỗi, 5/5 test pass)

KingCong Studio được thêm như **một image provider mới** tuân theo `ImageProviderInterface`
sẵn có (`packages/server-core/src/ai/`), chọn qua `IMAGE_PROVIDER=kingcong`. Mọi hàm hiện
tại (`generateColoringPage`, `colorizeImage`, `generateCoverSource*`, `generateImage`,
`editImage`) tự động chạy qua nó khi bật env.

Files:
- `packages/server-core/src/ai/image-provider-kingcong.ts` — provider (`kingcongImageProvider`)
- `packages/server-core/src/ai/image-provider.ts` — đã thêm nhánh `kingcong` vào factory `getProvider()`
- `packages/server-core/src/ai/image-provider-kingcong.test.ts` — 5 vitest (fake fetch + mock playwright)
- `apps/worker/src/scripts/kingcong-login.ts` — login Google THỦ CÔNG 1 lần (Chrome thật + tắt cờ automation)
- `apps/worker/src/scripts/kingcong-image-test.ts` — smoke test qua facade
- `apps/admin/.env.example` — block `KINGCONG_*`
- `.gitignore` — bỏ qua `.kingcong-session.json` + `.kingcong-profile/`

## Cách hoạt động
- Endpoint nội bộ `POST <base>/ajaxs/image.php`, auth bằng **cookie phiên** (không phải API key).
  - `generateImage`: create_task (không ảnh) → poll check_status → tải CDN url → trả `{base64, dataUrl}`.
  - `editImage(url,...)`: `resolveEditSource` chọn ảnh cho slot `image` (bỏ blank placeholder, composite nhiều reference) → create_task field `image` (image-to-image) → poll → base64.
  - `size` (1024x1024 / 1024x1792 / 1792x1024) → map `aspect_ratio` + `resolution`.
- **Cookie**: `KINGCONG_COOKIE` (env, cho Next/serverless) HOẶC `KINGCONG_SESSION_FILE` (JSON, cho worker).
- **Relogin fallback 2 tầng** (đã né lỗi Google "browser not secure"):
  1. HTTP remember-refresh: dùng cookie `remember_ai84` để KingCong cấp `PHPSESSID` mới — KHÔNG browser, KHÔNG Google. Đây là đường chính.
  2. Playwright persistent profile: chỉ khi `remember_ai84` cũng hết hạn (cần login Google 1 lần).

## Giới hạn 1-ảnh-nguồn — ĐÃ XỬ LÝ (không còn drop)
- `ajaxs/image.php` vẫn chỉ có **1 slot `image`**, nhưng `editImage` KHÔNG còn bỏ reference nữa.
  `resolveEditSource()` (trong `image-provider-kingcong.ts`) gộp mọi reference vào slot đó:
  1. **Bỏ blank placeholder**: facade dùng ảnh trắng 1×1 làm "primary" cho character/location
     extraction (nguồn thật nằm trong `referenceImageUrls`). Provider nhận diện đúng ảnh trắng và
     **loại nó**, đẩy ảnh nguồn thật vào slot `image` → image-to-image trên đúng nguồn.
  2. **Composite khi >1 reference thật**: dùng `sharp` tile các reference thành 1 montage ngang
     (nền trắng) rồi gửi 1 ảnh duy nhất → không reference nào bị mất
     (vd `generateColoringPage` character + location + art-style).
- Đã verify thực tế trên KingCong:
  - `generateCharacterReference(source=cat)` → giữ nguyên identity con mèo, tách nền trắng đúng
    (trước fix: ra nhân vật mèo-người tùy ý vì nguồn bị bỏ).
  - `generateColoringPage` 2 reference → nhân vật giữ identity trong scene mới (montage được dùng).
  - `colorizeImage` / clone reproduce (1 nguồn) → không đổi hành vi, vẫn hoàn hảo.
- Test: `image-provider-kingcong.test.ts` thêm 2 case (blank-drop + composite). Tổng 7 pass.

## Việc tiếp theo (đề xuất thứ tự)

1. **Lấy cookie thật (1 lần)** — vì Google chặn Playwright login:
   - Đăng nhập kingcongstudio.com bằng Chrome thật → DevTools → Application → Cookies → copy full
     (bắt buộc có `PHPSESSID` **và** `remember_ai84`).
   - Worker: tạo `apps/worker/.kingcong-session.json`:
     `{ "cookie": "PHPSESSID=...; remember_ai84=...; ...", "source": "manual" }`
   - Hoặc set env `KINGCONG_COOKIE="..."`.

2. **Smoke test end-to-end**:
   ```bash
   cd apps/worker
   IMAGE_PROVIDER=kingcong node --env-file=.env --import tsx src/scripts/kingcong-image-test.ts \
     "A simple black-and-white coloring book page of a happy cat, bold clean outlines" \
     [optional-source-image-url]
   ```
   Kỳ vọng: in `base64 length=...` + lưu `kingcong-test-output.jpg`. Nếu lỗi cookie → xem log
   (provider tự thử remember-refresh; nếu remember cũng chết mới cần login lại).

3. **Chạy qua luồng thật**: đặt `IMAGE_PROVIDER=kingcong` rồi chạy 1 generation job nhỏ
   (`apps/worker` — `generation-job-processor.ts` / step-deps). Kiểm tra ảnh ra + credit trừ đúng.
   Lưu ý: `apps/worker/.env` trỏ **Supabase production** → chạy job sẽ ghi DB thật + tốn credit;
   dùng book/DB an toàn khi test. Nhánh nhiều-reference giờ đã giữ nguồn (xem "Giới hạn ĐÃ XỬ LÝ").

4. **Quyết định phạm vi**: KingCong dùng cho toàn bộ image ops hay chỉ một số bước?
   Giờ mọi nhánh (kể cả character/location extraction, coloring-page nhiều ref) đều giữ được nguồn,
   nên bật `IMAGE_PROVIDER=kingcong` global đã an toàn hơn nhiều. Nếu vẫn muốn trộn provider theo
   bước: thêm cơ chế chọn provider (hiện `IMAGE_PROVIDER` là global một provider).

5. **(Tuỳ chọn) Cài Playwright cho worker** để có đường fallback cuối khi remember token chết:
   `cd apps/worker && yarn add -D playwright && npx playwright install chromium`, rồi
   `node --env-file=.env --import tsx src/scripts/kingcong-login.ts` (login Google tay 1 lần).

6. **Langfuse**: provider đã log `kingcong/generateImage|editImage`. KingCong không trả token usage
   nên `usage` trống — nếu muốn theo dõi chi phí, đọc `cost`/`new_balance` từ response và map vào trace.

## Giới hạn prompt 4000 ký tự — prompt rút gọn riêng cho KingCong
- KingCong từ chối prompt > 4000 ký tự (`Mô tả tối đa 4000 ký tự`). Các prompt dùng chung dài hơn
  nhiều: cover-source-bw 17k–28k, cover-source ~6.4k, colorization ~6.1k (Diaflow/Vertex nhận full).
- **Không cắt đuôi** (mất rule) — thay vào đó có **bản compact riêng** distill đúng ý cốt lõi trong
  ~1.6k–2.2k ký tự:
  - `buildCoverSourceBWPromptCompact(titleSafe)`
  - `buildCoverSourcePromptCompact(directive)`
  - `buildColorizationPromptCompact(directive)`
- Facade `image-provider.ts` chọn bản compact khi `IMAGE_PROVIDER=kingcong` (helper
  `usesCompactPrompts()`); provider khác vẫn dùng prompt đầy đủ.
- `createTask` trong provider vẫn **cap 4000** làm lưới an toàn cuối (vd promptOverride do operator
  nhập tay quá dài) — có `console.warn` khi phải cắt.
- Prompt ngắn (redesign 1.6k, coloring-page 1.4k, character/location extraction <1k) không cần compact.

## Prod ops — cookie qua host volume (đang chạy)
- Worker prod: `IMAGE_PROVIDER=kingcong`, `LLM_PROVIDER=diaflow`, `KINGCONG_POLL_TIMEOUT=600`
  (EC2 sinh ảnh ~200–360s, mặc định 180s bị timeout), `KINGCONG_POLL_INTERVAL=5`.
- **KHÔNG** để `KINGCONG_COOKIE` trong `.env.prod` — docker-compose env_file không parse được
  cookie (có `g_state={...}` với `"` `;` `{}`) → `docker compose up` fail.
- Cookie nằm trên **host volume**: `docker-compose.prod.yml` bind-mount **thư mục**
  `/opt/vx-admin-data:/data` (KHÔNG mount 1 file — single-file bind mount bị decouple, ghi không
  phản chiếu về host), `.env.prod` đặt `KINGCONG_SESSION_FILE=/data/kingcong-session.json`.
  → PHPSESSID refresh lúc runtime **sống qua restart/redeploy**; thư mục nằm ngoài cây rsync nên
  deploy không ghi đè.
- **Đổi cookie nóng (không rebuild)** khi remember token chết: cập nhật
  `apps/worker/.kingcong-session.json` (cookie mới từ Chrome) rồi chạy
  `apps/worker/scripts/kingcong-reseed-prod.sh` (scp vào volume + `docker restart vx-worker`).
- **Playwright fallback KHÔNG cài** trên worker: cần profile Google đăng nhập sẵn (không tạo được
  trên EC2 headless), Alpine không chạy chromium bundled, và Google có thể chặn profile copy trên
  IP EC2. Dùng reseed thủ công ở trên thay thế.

## Lệnh kiểm thử
```bash
cd packages/server-core
npx tsc --noEmit -p tsconfig.json          # phải 0 lỗi
npx vitest run src/ai/image-provider-kingcong.test.ts   # 5 pass
```

## Cảnh báo giữ nguyên
- Endpoint nội bộ (không phải hợp đồng công khai) → chủ site đổi field là hỏng; đã cô lập ở
  `rawPost`/`createTask` để dễ thay khi họ ra API chính thức.
- Cookie/profile là credential → đã gitignore; không log, không commit.
- Tự động hoá kiểu này có thể vi phạm ToS của KingCong → chỉ dùng tài khoản + credit của bạn.
```
