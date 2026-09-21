# clone-coloring-web (VX Admin monorepo)

Công cụ nội bộ để clone và tạo sách tô màu bằng AI: trang admin quản lý source book, clone job, sách và trang; worker chạy pipeline sinh ảnh qua hàng đợi; mobile-api phục vụ app. TODO(user): bổ sung 1 câu về người dùng cuối / mục tiêu kinh doanh nếu cần.

## Stack & cấu trúc

- TypeScript, Yarn 4 workspaces (`yarn@4.14.1`) + Turborepo. Postgres qua Prisma, Redis + BullMQ cho hàng đợi, Docker Compose trên EC2.
- `apps/admin` — Next.js + TanStack Query, shadcn/ui (`@vx/admin`)
- `apps/worker` — worker hàng đợi sinh ảnh + các script backfill (`@vx/worker`)
- `apps/mobile-api` — API cho mobile (`@vx/mobile-api`); `apps/motion` (`@vx/motion`)
- `packages/core-uikit` (UI, API layer, i18n dùng chung), `packages/db` (Prisma), `packages/coloring`, `packages/clone-core`, `packages/server-core`, `packages/auth-module`
- `tooling/` — tsconfig, eslint, tailwind dùng chung, CLI `vx:add-entity`

## Lệnh

- Cài đặt: `yarn install`
- Chạy dev: `yarn dev` (tất cả) hoặc `yarn dev --filter=@vx/admin`
- Test: **không có script test ở root**. Chạy theo package: `yarn workspace <tên package> test` (có ở `@vx/admin`, `@vx/worker`, `@vx/mobile-api`, `@vx/core-uikit`, `@vx/coloring`, `@vx/clone-core`, `@vx/server-core`, `@vx/db`), hoặc `yarn turbo run test`
- Typecheck: `yarn typecheck`. Đã có sẵn lỗi từ trước (vài test admin và khoảng 19 lỗi tsc ở worker), đừng nhầm là lỗi mới. `@vx/coloring` không có script typecheck.
- Lint/format: `yarn lint`; prettier chạy tự động qua lint-staged khi commit
- Build: `yarn build`
- Prisma: `yarn workspace @vx/db generate` (nếu lỗi EPERM thì là do dev server đang giữ file, hãy tắt dev server trước)

## Convention

- Quy ước code, import, CRUD, i18n: xem `CLAUDE.md` và `docs/CODEBASE-RULES.md`, `docs/AI-GUIDE.md`, `docs/TECHNICAL.md`. TODO(user): các file này còn mô tả admin chạy Vite + TanStack Router, trong khi `apps/admin` hiện đã là Next.js; cần rà soát lại.
- Commit theo Conventional Commits (commitlint chạy trong hook `.husky/commit-msg`), đặt tiền tố tầng ở trước: `[claude] fix(scope): ...`
- **Branch:** nhánh làm việc là `main`. Việc mới tạo nhánh `feat/*` / `fix/*` / `refactor/*`, xong thì merge về `main` (hiện đang merge ở local).
- **Ship / deploy:** không có CI/CD, push lên `origin` **không** kích hoạt deploy. Deploy thủ công bằng `./deploy.sh` (docker compose lên EC2, có chạy migrate). Deploy và push là việc của user: **luôn hỏi user trước khi `git push` hoặc chạy `deploy.sh`**. `deploy.sh` ghi đè `.env.prod` trên server bằng bản ở local.
- Dev ở local trỏ vào DB production qua SSH tunnel. Không chạy migration, backfill hay script ghi dữ liệu khi chưa hỏi user.
- **Không commit secret.** Không in giá trị API key / token ra log hay commit message. Không đọc hoặc sửa các file `.env*` và `service-account*.json` nếu user không yêu cầu.

## Quy tắc bàn giao (bắt buộc với mọi agent)

- Khi bắt đầu phiên, hoặc khi user nói "tiếp tục": chạy `git status` và đọc docs/handoff.md MỘT lần. Nếu có thay đổi chưa commit, đó là bước dở của tầng trước bị ngắt do hết quota: xem diff, hoàn thiện hoặc sửa lại, rồi commit trước khi làm bước tiếp theo.
- Mỗi thời điểm chỉ một agent làm việc trên repo. Không chạy hai tầng song song trên cùng thư mục.
- Task mới: chia thành các bước nhỏ (mỗi bước làm xong được trong một lượt ngắn), ghi vào docs/handoff.md TRƯỚC khi code.
- Sau mỗi bước xong: sửa handoff.md bằng edit nhỏ (đánh [x], thêm quyết định nếu có). Không viết lại cả file. Sau đó git commit.
- Commit message bắt đầu bằng tiền tố công cụ, được quy định trong config cấp user của từng agent. Nếu không biết tiền tố của mình, hỏi user, không tự đoán.
- Giữ handoff.md dưới ~60 dòng, gạch đầu dòng ngắn, ghi đường dẫn file thay vì mô tả dài.
- Task xong: tóm tắt 3–5 dòng vào docs/history.md, rồi reset handoff.md về mẫu trống.
- Không đọc docs/history.md trừ khi cần tra cứu quyết định cũ.
- Chi tiết "đã sửa gì" để trong commit message. handoff.md chỉ giữ: việc tiếp theo, quyết định kèm lý do, cảnh báo.
