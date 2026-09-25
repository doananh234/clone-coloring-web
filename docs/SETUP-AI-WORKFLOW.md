# SETUP-AI-WORKFLOW — Nhiều tầng agent làm việc trên cùng một repo (v4, dùng cho dự án bất kỳ)

> **Dành cho agent setup** (Claude Code hoặc agent tương đương có quyền đọc/ghi file và chạy lệnh).
> Khi user nói _"đọc file này và setup"_: làm lần lượt mục **B**, nghiệm thu theo mục **D**, rồi báo cáo theo mục **E**.
>
> Bốn nguyên tắc bắt buộc:
>
> - **Không ghi đè file đã có.** Gộp nội dung, giữ nguyên phần của user.
> - **File ngoài repo** (`~/.claude`, `~/.claude-qwen`, shell profile, settings của IDE) — **hỏi user trước khi ghi**, và cho user xem nội dung sẽ ghi.
> - **Không đoán.** Mọi thông tin về dự án phải lấy từ **B1**. Chỗ nào không chắc thì ghi `TODO(user): ...` thay vì bịa.
> - **Mọi đoạn code trong file này là ví dụ minh hoạ**, không phải lệnh để chép nguyên. Thay bằng lệnh thật của dự án lấy từ B1.

---

## A. Bối cảnh: user làm việc thế nào

Phần này thuộc về **user**, không đổi theo dự án. User dùng nhiều tầng agent và chuyển tầng khi tầng trên hết quota (**chuỗi fallback**). Cấu hình điển hình:

| Tầng | Công cụ                           | Model                       | Nguồn quota                     | Thư mục config   |
| ---- | --------------------------------- | --------------------------- | ------------------------------- | ---------------- |
| 1    | Claude Code (extension trong IDE) | Claude                      | Gói trả phí                     | `~/.claude`      |
| 2    | Agent thứ hai (ví dụ Antigravity) | Model của nhà cung cấp khác | Gói trả phí khác                | (của công cụ đó) |
| 3    | Claude Code CLI trong terminal    | Model tự host qua proxy     | Không giới hạn, nhưng chạy chậm | `~/.claude-qwen` |

> Nếu user chỉ có 2 tầng, bỏ dòng tương ứng và bỏ luôn các bước dành riêng cho tầng đó. Số tầng không quan trọng; **quy tắc bàn giao** mới là thứ làm cho mô hình này chạy được.

Tầng 1 và tầng 3 ở ví dụ trên **dùng chung một công cụ**, chỉ khác model và thư mục config — nên cả hai cùng đọc file rule trong repo, cùng skills của dự án, cùng bộ tool.

Nguyên tắc cốt lõi:

- **Trí nhớ chung nằm trong repo, không nằm trong lịch sử chat.** Mỗi tầng có bộ nhớ riêng mà tầng khác không thấy. Thứ duy nhất cả ba cùng đọc được là file trong repo.
- **`AGENTS.md` là nguồn quy tắc duy nhất.** Các file rule riêng của từng công cụ chỉ trỏ về nó.
- **`docs/handoff.md` là sổ bàn giao:** một file, sửa tại chỗ, cập nhật sau mỗi bước, để tầng sau tiếp tục được khi tầng trước đứt giữa chừng.
- **Git là checkpoint.** Mỗi bước xong thì commit, kèm tiền tố cho biết tầng nào làm.
- **Tiền tố commit nằm ở config cấp user**, không nằm trong repo — vì nhiều tầng cùng đọc file rule của repo, không phân biệt được ai là ai.

---

## B. Nhiệm vụ setup

### B1. Khảo sát repo (làm trước, mọi bước sau đều dựa vào kết quả này)

Đọc cấu trúc thư mục, file manifest, README, file rule sẵn có. Cần trả lời đủ bảng dưới đây **trước khi viết bất cứ file nào**:

| Cần biết                                  | Cách tìm                                                                                                         | Dùng ở bước |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- |
| Stack, package manager                    | `package.json` / `pyproject.toml` / `go.mod` / `Cargo.toml` / `Gemfile` / `pom.xml`; trường `packageManager`     | B2          |
| Lệnh install/dev/test/lint/build          | `scripts` trong manifest, `Makefile`, `Taskfile.yml`, README                                                     | B2, B8, B10 |
| Trình quản lý git hook                    | `git config core.hooksPath`; thư mục `.husky/`, `.lefthook.yml`, `.pre-commit-config.yaml`, `.githooks/`         | B6          |
| Có commitlint / conventional commit không | `commitlint.config.*`, `.commitlintrc*`, khoá `commitlint` trong manifest; `git log --oneline -30`               | B5          |
| CI/CD: nhánh nào deploy                   | `.github/workflows/*.y*ml`, `.gitlab-ci.yml`, `Jenkinsfile` → đọc khối `on:` / `only:`; **có lọc `paths` không** | B2, C       |
| Quy ước branch **thật**                   | `git branch -vv`; `git rev-list --left-right --count origin/<a>...origin/<b>` để xem nhánh nào thực sự đang sống | B2          |
| File rule / skills sẵn có                 | `.claude/`, `.cursor/rules/`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`                            | B3, B7      |

Hai chỗ đặc biệt dễ sai, phải kiểm chứng bằng lệnh chứ không đọc comment:

- **Nhánh nào đang thật sự được dùng.** Comment trong CI hay README thường nói một đằng, lịch sử git nói một nẻo. `git rev-list --left-right --count origin/main...origin/release` cho biết nhánh nào bị bỏ hoang.
- **Push vào nhánh nào thì deploy thật.** Nếu workflow deploy không có `paths:` filter, một commit sửa docs cũng kích hoạt build + migrate + restart service.

Ghi kết quả khảo sát vào AGENTS.md ở bước sau. Chỗ nào không kiểm chứng được → `TODO(user): ...`.

### B2. Tạo hoặc gộp `AGENTS.md` (nguồn quy tắc duy nhất)

Điền phần dự án từ B1. Phần **Quy tắc bàn giao** chép **nguyên văn**, không rút gọn:

```markdown
# <Tên dự án>

<Mô tả 2–3 câu: dự án làm gì, cho ai>

## Stack & cấu trúc

- <ngôn ngữ, framework, hạ tầng>
- <thư mục chính và vai trò>

## Lệnh

- Cài đặt: <lệnh>
- Chạy dev: <lệnh>
- Test: <lệnh> (ghi rõ nếu không có script test ở root)
- Lint/format: <lệnh>
- Build: <lệnh>

## Convention

- <quy ước code; trỏ sang file rule sẵn có thay vì chép lại>
- **Branch:** nhánh làm việc là `<nhánh thật từ B1>`. Việc mới tạo nhánh `<tiền tố>/*` rồi merge/PR về đó.
- **Ship / deploy:** <nhánh nào, cơ chế nào>. **Nếu push vào nhánh đó kích hoạt deploy thật thì ghi rõ ở đây**, kèm việc deploy có lọc path hay không, và quy định: luôn hỏi user trước khi push nhánh đó.
- **Không commit secret.** Không in giá trị API key / token ra log hay commit message.

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
```

### B3. File rule riêng của từng công cụ (chỉ trỏ về AGENTS.md)

Mỗi công cụ tự quy định tên file rule của nó. Tra đúng tên trong tài liệu của công cụ đang cài, **đừng đoán** — sai tên thì file nằm im và không ai báo lỗi. Một số tên thường gặp: `CLAUDE.md` (Claude Code), `.agents/rules/*.md`, `.cursor/rules/*`, `.github/copilot-instructions.md`, `GEMINI.md`.

Với công cụ dùng `CLAUDE.md` (áp dụng cho **mọi** tầng chạy Claude Code — **không ghi tiền tố commit ở đây**, vì các tầng đó dùng chung file):

```markdown
@AGENTS.md
```

Nếu `CLAUDE.md` đã có nội dung riêng: giữ nguyên, thêm dòng `@AGENTS.md` lên đầu, chuyển các quy tắc trùng lặp sang AGENTS.md.

Với tầng 2 (ví dụ `.agents/rules/shared.md`) — đây là nơi **được phép** ghi tiền tố, vì file này chỉ công cụ đó đọc:

```markdown
Tuân theo toàn bộ AGENTS.md ở thư mục gốc repo, đặc biệt là "Quy tắc bàn giao".

- Tiền tố commit của bạn: [<tên tầng>]
- Implementation plan phải bám theo các bước trong docs/handoff.md, không tự mở rộng phạm vi.
- Skills của dự án nằm trong <đường dẫn từ B1>. Khi một bước cần skill, đọc trực tiếp file SKILL.md tương ứng và làm theo.
```

### B4. Sổ bàn giao

Tạo **`docs/handoff.md`**:

```markdown
# Task hiện tại: (chưa có)

## Các bước

- [ ] 1. ...

## Đã chốt

-

## Lưu ý cho agent tiếp theo

-
```

Tạo **`docs/history.md`** với dòng `# Lịch sử task đã xong`.

### B5. Cho tiền tố commit sống chung với commitlint

Bỏ qua bước này nếu B1 cho thấy repo không dùng commitlint.

Nếu repo có `@commitlint/config-conventional`, commit `[claude] fix(api): abc` sẽ **bị từ chối**: commitlint đọc `[claude]` như phần type và không khớp type hợp lệ nào. Phải mở rộng `headerPattern` để tiền tố trở thành phần tuỳ chọn đứng trước:

```js
// commitlint.config.mjs — giữ nguyên extends sẵn có, chỉ thêm parserPreset
export default {
  extends: ["@commitlint/config-conventional"],
  parserPreset: {
    parserOpts: {
      headerPattern: /^(?:\[(claude|antigravity|qwen|user)\] )?(\w+)(?:\(([^)]*)\))?!?: (.+)$/,
      headerCorrespondence: ["agent", "type", "scope", "subject"],
    },
  },
};
```

Đổi danh sách trong nhóm `(claude|antigravity|qwen|user)` cho khớp các tầng user thật sự dùng, cộng thêm `user` cho lúc user tự commit tay.

**Test ngay, đừng tin suông** — chạy đúng CLI của repo (`npx commitlint`, `pnpm commitlint`, `yarn commitlint`…):

```sh
for m in "[claude] fix(api): abc" "[user] docs: abc" "fix(api): khong tien to" "linh tinh"; do
  printf '%-32s => ' "$m"
  echo "$m" | npx --no-install commitlint >/dev/null 2>&1 && echo PASS || echo FAIL
done
```

Kỳ vọng: hai dòng đầu PASS, dòng cuối FAIL. Dòng thứ ba PASS hay FAIL là tuỳ bước B6.

### B6. (Tuỳ chọn) Bắt buộc tiền tố bằng hook `commit-msg`

Hỏi user có muốn bắt buộc không. Nếu có, **đừng đụng vào `core.hooksPath`** khi repo đã có trình quản lý hook — đổi đường dẫn đó sẽ vô hiệu hoá toàn bộ hook hiện có (commitlint, lint-staged, format…) mà không báo lỗi gì.

Đoạn kiểm tra dùng chung:

```sh
grep -qE '^\[(claude|antigravity|qwen|user)\] ' "$1" || {
  echo "Commit message phải bắt đầu bằng [claude], [antigravity], [qwen] hoặc [user]"
  echo "Ví dụ: [claude] fix(api): sửa timeout khi gọi service X"
  exit 1
}
```

Đặt nó ở đâu thì tuỳ kết quả B1:

| Repo đang dùng                        | Cách làm                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Husky** (`core.hooksPath=.husky/_`) | Chèn đoạn trên vào **đầu** `.husky/commit-msg` đang có, trước dòng gọi commitlint. Không đổi `core.hooksPath`. |
| **Lefthook**                          | Thêm một mục vào `commit-msg` trong `lefthook.yml`, chạy script chứa đoạn trên.                                |
| **pre-commit (Python)**               | Thêm một local hook `stages: [commit-msg]` vào `.pre-commit-config.yaml`.                                      |
| **Không có gì**                       | Mới tạo `.githooks/commit-msg` (thêm `#!/bin/sh` ở đầu, `chmod +x`) và `git config core.hooksPath .githooks`.  |

Test bằng cách ghi message mẫu ra file tạm rồi gọi thẳng hook: `sh .husky/commit-msg /tmp/msg`. Phải thấy message thiếu tiền tố bị chặn, message đủ tiền tố đi tiếp sang commitlint.

Lưu ý với user: khi đã bật, **chính user commit tay cũng phải dùng `[user]`**.

### B7. Skills / prompt dùng chung giữa các tầng

Xác định skill (hoặc prompt template) của dự án đang nằm ở đâu:

- Nằm **trong repo** (ví dụ `.claude/skills/`) → mọi tầng dùng chung công cụ đó đều thấy. Không cần làm gì.
- Chỉ nằm trong thư mục config **cấp user** của một tầng → tầng khác không thấy. Đề xuất user chuyển vào repo (nếu là skill riêng của dự án) hoặc copy sang thư mục config còn lại (nếu là skill cá nhân dùng cho nhiều dự án). **Chỉ thực hiện khi user đồng ý.**

### B8. File config cấp user (ngoài repo — phải hỏi user trước khi ghi)

Mục đích: mỗi tầng tự biết tiền tố commit của mình. Nhắc user: file cấp user áp dụng cho **mọi dự án** mở bằng tầng đó, nên chỉ ghi vào đây những gì đúng với mọi dự án.

**Tầng 1** — `~/.claude/CLAUDE.md`, gộp thêm:

```markdown
- Tiền tố commit của bạn: [claude]
  Repo có commitlint dạng Conventional Commits thì đặt tiền tố trước: `[claude] fix(scope): ...`
- Vai trò ưu tiên: lập kế hoạch và chia bước cho task mới; review commit của các tầng khác khi user yêu cầu.
- Nếu repo có AGENTS.md ở thư mục gốc, đó là nguồn quy tắc duy nhất của dự án — đọc và tuân theo, đặc biệt mục "Quy tắc bàn giao".
```

**Tầng 3 (model tự host, chạy chậm nhưng không giới hạn)** — `~/.claude-qwen/CLAUDE.md`, gộp thêm:

```markdown
- Tiền tố commit của bạn: [qwen]
- Bạn chạy local, không giới hạn quota: được nhận task lớn và dài, làm liên tục nhiều bước mà không cần dừng chờ user.
- Nếu task chưa có kế hoạch trong docs/handoff.md, tự lập kế hoạch và chia bước theo Quy tắc bàn giao.
- Bạn chạy chậm nên phải làm việc có mục tiêu: tìm đúng file (grep/glob) thay vì đọc cả repo; gom thay đổi liên quan vào một lần sửa; chạy test theo phạm vi thay đổi trước, chạy toàn bộ ở cuối task.
- Vẫn cập nhật handoff.md và commit sau MỖI bước, để phiên bị ngắt thì không mất tiến độ.
- Ghi quyết định thiết kế quan trọng vào mục "Đã chốt" kèm lý do.
- Chỉ dừng hỏi user khi: yêu cầu mơ hồ ảnh hưởng thiết kế; cần thao tác không đảo ngược được (xoá dữ liệu, đổi schema/migration, push); hoặc test vẫn lỗi sau 3 lần sửa. Khi dừng, ghi rõ tình trạng vào mục "Lưu ý" của handoff.md.
```

Để tầng 3 chạy dài mà không bị hỏi quyền liên tục, đề xuất thêm vào `~/.claude-qwen/settings.json` (gộp nếu đã có, **chỉ ghi khi user đồng ý**, và thay bằng lệnh thật từ B1):

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Write",
      "Glob",
      "Grep",
      "Bash(git status:*)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(git show:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git rm:*)",
      "Bash(<lệnh test của dự án>:*)",
      "Bash(<lệnh lint>:*)",
      "Bash(<lệnh build>:*)"
    ],
    "deny": ["Bash(git push:*)", "Bash(rm -rf:*)", "Read(./.env*)"]
  }
}
```

Lệnh không nằm trong hai danh sách vẫn hỏi user như bình thường. `git push` nằm trong `deny` là cố ý: push là thao tác user phải tự quyết.

### B9. Kiểm tra cách khởi chạy tầng dùng model tự host (chỉ kiểm tra và báo)

Rủi ro lớn nhất: nếu biến môi trường của proxy được đặt **toàn cục**, tầng 1 cũng bị trỏ sang model tự host — hoặc ngược lại, bị tính phí API thay vì dùng gói thuê bao.

1. Kiểm tra biến môi trường, **chỉ in ra là có đặt hay không, không in giá trị**:

   ```powershell
   foreach ($v in 'ANTHROPIC_API_KEY','ANTHROPIC_BASE_URL','ANTHROPIC_AUTH_TOKEN','CLAUDE_CONFIG_DIR') {
     foreach ($s in 'User','Machine') {
       if ([Environment]::GetEnvironmentVariable($v, $s)) { "$v dang dat o cap $s" }
     }
   }
   Select-String -Path $PROFILE -Pattern 'ANTHROPIC_|CLAUDE_CONFIG_DIR' -ErrorAction SilentlyContinue
   ```

   (macOS/Linux: `env | cut -d= -f1 | grep -E 'ANTHROPIC_|CLAUDE_CONFIG_DIR'`, rồi grep trong `~/.zshrc` / `~/.bashrc`.)

2. **Cách cô lập gọn nhất:** để toàn bộ cấu hình proxy trong `~/.claude-qwen/settings.json` (khối `env`), còn shell profile chỉ đặt đúng một biến `CLAUDE_CONFIG_DIR` cho lần chạy đó. Như vậy không có biến nào rò ra toàn hệ thống:

   ```powershell
   function claude-qwen {
     $prev = $env:CLAUDE_CONFIG_DIR
     $env:CLAUDE_CONFIG_DIR = Join-Path $HOME '.claude-qwen'
     try { claude @args } finally { $env:CLAUDE_CONFIG_DIR = $prev }
   }
   ```

3. **Tên model phụ.** Ngoài model chính, Claude Code còn gọi model khác cho tác vụ nền và subagent theo tên model có sẵn của nó. Nếu proxy không nhận những tên đó, lời gọi sẽ lỗi ngầm và task dài đứt giữa chừng. Map hết về model tự host trong khối `env` của `settings.json`:

   ```json
   {
     "env": {
       "ANTHROPIC_BASE_URL": "<url proxy>",
       "ANTHROPIC_AUTH_TOKEN": "<virtual key>",
       "ANTHROPIC_MODEL": "<tên model trên proxy>",
       "ANTHROPIC_SMALL_FAST_MODEL": "<tên model trên proxy>",
       "ANTHROPIC_DEFAULT_HAIKU_MODEL": "<tên model trên proxy>",
       "ANTHROPIC_DEFAULT_SONNET_MODEL": "<tên model trên proxy>",
       "ANTHROPIC_DEFAULT_OPUS_MODEL": "<tên model trên proxy>"
     }
   }
   ```

   Cách khác: trong config của proxy, map mọi tên model về model tự host (alias hoặc entry wildcard). Kiểm chứng bằng bài test **D3**.

4. Nếu model chạy sau vLLM, nhắc user các cờ giúp bớt chậm: `--enable-prefix-caching` (quan trọng nhất — prompt hệ thống của agent rất dài và lặp lại mỗi lượt), `--enable-auto-tool-choice --tool-call-parser <parser hợp model>`, và `--max-model-len` càng lớn càng đỡ bị nén context giữa chừng.

### B10. Phân quyền cho tầng 2

Đưa user danh sách để dán vào phần permissions của công cụ đó, điều chỉnh theo lệnh thật từ B1. **Cú pháp dưới đây chỉ minh hoạ** — đối chiếu với giao diện Permissions của bản đang cài rồi chuyển sang đúng định dạng của nó:

```
# DENY
command(rm -rf .*)
command(git push --force.*)
write_file(\.env.*)
# ASK
command(git push.*)
# ALLOW
command(git (status|diff|log|add|commit).*)
command(<lệnh test/lint/build của dự án>)
```

### B11. `.gitignore` và commit

- Đảm bảo không ignore nhầm file vừa tạo: `AGENTS.md`, file rule của từng công cụ, `docs/`, thư mục skills.
- Ngược lại, thêm vào `.gitignore` những thứ chỉ làm bẩn `git status` và khiến phiên sau tưởng là bước dở: thư mục setting của IDE, file build info, cache.
- Commit với tiền tố của tầng đang chạy, ví dụ: `[claude] chore: setup multi-agent workflow (AGENTS.md, handoff)`.

---

## C. Quy trình làm việc hằng ngày (để user tham khảo)

1. **Task mới, bắt đầu ở tầng 1:** _"Task: <mô tả>. Lập kế hoạch vào handoff.md rồi làm."_
2. **Tầng 1 hết quota** → mở tầng 2 → gõ _"tiếp tục"_.
3. **Tầng 2 hết quota** → mở tầng 3 → gõ _"tiếp tục"_ (hoặc giao task mới). Tầng 3 làm liên tục nhiều bước và tự commit, nên có thể để nó chạy; chỉ cần quay lại khi nó hỏi, hoặc xem `docs/handoff.md` và `git log`.
4. **Tầng 1 có quota lại** → nếu tầng 3 đang chạy thì dừng nó trước (bước dở sẽ được xử lý nhờ `git status`). Sau đó: _"Review các commit của tầng khác kể từ lần cuối tôi dùng bạn, sửa nếu cần, rồi tiếp tục."_ Xem nhanh bằng `git log --oneline --grep "\[qwen\]"`.
5. **Có sự cố:** tầng nào làm hỏng thì `git revert` commit mang tiền tố của tầng đó. handoff.md dài ra thì bảo agent _"rút gọn handoff.md"_.
6. **Muốn chạy song song:** `git worktree add ../<repo>-<tầng> <branch>` để tầng chậm làm trong thư mục riêng, trên branch riêng. Hai tầng không đụng file của nhau, mỗi thư mục có handoff.md riêng.
7. **Push và deploy là việc của user.** Nếu B1 cho thấy push vào một nhánh nào đó kích hoạt deploy, agent phải hỏi trước — kể cả khi thay đổi chỉ là docs.

---

## D. Nghiệm thu (làm đủ ba bài, đừng dừng ở bài 1)

**D1 — Rule đã được nạp chưa.** Hỏi từng tầng: _"Tiền tố commit của bạn là gì?"_ Mỗi tầng phải trả lời đúng tiền tố của mình.

> Nếu một tầng trả lời sai hoặc không biết, nghĩa là nó không đọc file config cấp user. Phương án dự phòng: đặt thêm biến `AI_TIER=<tên tầng>` khi khởi chạy tầng đó, rồi thêm vào `AGENTS.md`: _"Nếu biến môi trường AI_TIER có giá trị X thì áp dụng quy tắc của tầng X (tiền tố [X], chạy liên tục nhiều bước); nếu không đặt thì theo config cấp user."_ Khi đó chuyển khối quy tắc của tầng đó từ B8 vào AGENTS.md, dưới một mục riêng.

**D2 — Diễn tập bàn giao thật.** Đây mới là bài chứng minh quy trình chạy được, và nó bắt được lỗi mà D1 không thấy. Giao một task nhỏ có thật, 2–3 bước: tầng 1 ghi handoff + làm bước 1 + commit, rồi user dừng tầng 1 và gõ _"tiếp tục"_ ở tầng khác. Quan sát bốn điểm:

1. Tầng sau có **tự** chạy `git status` và đọc handoff.md không, hay hỏi lại _"làm gì bây giờ?"_
2. Commit có **đúng tiền tố** không — nếu đã bật hook B6 thì xem nó có tự đọc thông báo lỗi và sửa message không.
3. Có commit **từng bước riêng** không, hay gộp hết vào một commit.
4. Có bị hỏi quyền liên tục không → nếu có, bổ sung lệnh còn thiếu vào allowlist ở B8.

Cho mỗi tầng chạy ít nhất một lượt như vậy. Một tầng trả lời đúng câu hỏi ở D1 vẫn có thể trượt D2.

**D3 — Subagent của tầng dùng proxy.** Trong phiên tầng 3, giao một việc nhỏ có dùng subagent (ví dụ _"dùng subagent tìm file định nghĩa X"_). Xem log proxy có request nào lỗi `model not found` không. Nếu có, quay lại B9.3.

---

## E. Báo cáo sau khi setup

1. Danh sách file đã tạo hoặc gộp, **tách riêng file trong repo và file ngoài repo**.
2. Các mục `TODO(user)` còn lại trong AGENTS.md.
3. Kết quả B1 phần CI/CD và branch: nhánh nào làm việc, nhánh nào deploy, push có deploy thật không.
4. Kết quả B5 (commitlint), B7 (skills), B9 (biến môi trường, cách khởi chạy, model phụ), kèm việc user cần làm. Hỏi user có muốn bật hook B6 không.
5. Danh sách phân quyền cho tầng 2 từ B10.
6. Hướng dẫn user chạy ba bài nghiệm thu ở mục D, nói rõ D2 cần user thao tác chuyển tầng.

---

## F. Những cái bẫy đã gặp thật (đọc trước khi bắt tay)

- **Đổi `core.hooksPath` sẽ giết hook đang có.** Repo dùng husky thường đặt `core.hooksPath=.husky/_`; trỏ nó sang thư mục khác làm mất commitlint và lint-staged mà không báo lỗi. Chèn vào hook sẵn có, đừng thay đường dẫn.
- **commitlint từ chối tiền tố nếu chưa mở rộng parser.** `[claude] fix: abc` bị đọc thành type `[claude]`. Sửa `headerPattern` (B5) rồi test bằng echo, trước khi báo với user là đã xong.
- **Push vào nhánh deploy là thao tác không đảo ngược.** Nhiều workflow deploy không lọc `paths`, nên một commit docs cũng build image + chạy migration + restart service. Luôn đọc khối `on:` của workflow trước khi push, và luôn hỏi user.
- **Comment trong CI có thể mô tả một quy trình đã chết.** Kiểm chứng bằng `git rev-list --left-right --count` trước khi ghi quy ước branch vào AGENTS.md — nếu nhánh "chính" đã bị bỏ hoang hàng chục commit thì phải hỏi user muốn theo thực tế hay muốn khôi phục.
- **Agent trả lời đúng lý thuyết vẫn có thể làm sai thực tế.** Bài hỏi tiền tố chỉ chứng minh nó đọc được file rule, không chứng minh nó tuân thủ quy trình. Luôn chạy D2.
- **Mỗi công cụ ghi file theo kiểu riêng** (thêm dòng trống cuối file, đổi kiểu xuống dòng). Nếu sau khi tầng khác làm xong mà `git status` còn thay đổi lặt vặt, xem diff trước khi kết luận là bước dở.

---

## G. Tuỳ chọn: autocomplete khi gõ code

Agent dạng chat không có autocomplete nội dòng. Nếu cần, cài một extension autocomplete riêng (ví dụ Continue) và **chỉ dùng cho autocomplete**, không dùng để chat hay chạy agent. Model nên là bản coder nhỏ (7B–14B) để độ trễ thấp, trỏ qua proxy với role dành riêng cho autocomplete. Không cần file rule cho nó.
