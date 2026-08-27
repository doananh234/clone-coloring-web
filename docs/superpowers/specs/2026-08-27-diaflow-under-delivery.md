# Diaflow trả thiếu trang — điều tra & bàn giao

**Ngày:** 2026-08-27
**Trạng thái:** Đã tìm ra hậu quả và loại trừ được vài giả thuyết. **Chưa tìm ra nguyên nhân gốc.** Chưa viết code sửa — đang chờ quyết định về ngưỡng.
**Nhánh:** `main`

---

## Pick up here

```bash
git fetch origin && git checkout main && git pull
yarn install
```

Mang hai file env sang từ máy kia (không có trong git, không được commit):

- `apps/admin/.env.local`
- `apps/worker/.env` — **có thể đã bị xoá**, xem mục "Bẫy đã biết" bên dưới
- (để deploy còn cần `apps/admin/.env.prod`, `apps/worker/.env.prod`, `apps/mobile-api/.env.prod`)

Mở tunnel trước khi chạy bất cứ thứ gì chạm DB:

```bash
ssh -N -o ServerAliveInterval=30 -L 5432:localhost:5432 -L 6379:localhost:6379 ec2-user@3.216.170.208
yarn workspace @vx/admin dev
```

**Khi tunnel mở, `localhost:5432` LÀ production.** Không bao giờ chạy `prisma db push`,
`migrate`, `db seed` vào đó. Worker chạy local trên Redis đã tunnel sẽ ăn job production thật.

Công cụ chẩn đoán đã có sẵn (chỉ đọc, không ghi):

```bash
node --env-file=apps/admin/.env.local scripts/gate-dry-run.mjs
```

---

## Vấn đề

`stepOneShot` gửi PDF cho Diaflow và nhận về một mảng kết quả từng trang. Nó **không
bao giờ đối chiếu số kết quả nhận về với số trang đã gửi đi**. Sau đó `create-book`
lấp chỗ trống bằng `p.redesignedUrl ?? p.imageUrl` (`create-book.ts:122`).

Hệ quả: mỗi trang Diaflow không trả về sẽ trở thành **một trang ảnh gốc** nằm trong
book, mà job vẫn được đánh dấu `reproduced` — không lỗi, không cảnh báo.

Với một pipeline clone để bán, đây không chỉ là lỗi chất lượng.

### Số liệu (đo 2026-08-27 trên production)

114 job `status = reproduced` có dữ liệu trang:

| | số job | |
|---|---|---|
| Đủ 100% | 73 | 64% |
| **Thiếu** | **41** | **36%** |
| — thiếu 1 trang | 22 | |
| — thiếu 2–3 | 13 | |
| — thiếu 4–10 | 3 | |
| — thiếu >10 | 3 | |

Nghĩa là **41 book trong thư viện đang chứa ảnh gốc** mà chưa ai biết.

### Bốn ca nặng

| Job | redesigned | Book | isPublic | Hình thái |
|---|---|---|---|---|
| `67a6db1f` DoodleDaisy_CurvyGirl1 | **1/42** | `cc0e4a4e` (40 trang) | false | 39 trang là ảnh gốc |
| `5a57b956` 28_ViViTinta_Relaxation | **1/50** | `791e86d8` (40 trang) | false | 39 trang là ảnh gốc |
| `d897eeca` Tita_HappyC | 20/39 | `d243d6c1` (20 trang) | **true** | book ngắn, không lẫn ảnh gốc |
| `a6ec89f2` Bobbie_Goods_Summer_Break | 23/26 | `dfc88186` (23 trang) | **true** | book ngắn, không lẫn ảnh gốc |

Hai ca đầu là hai job **duy nhất** chạy trên worker sau khi nhánh classify-before-spend
lên production. Cả hai đều về đúng 1 trang. Trước đó chưa từng thảm hoạ đến vậy.

Hai ca sau (2026-08-07) là hình thái khác: book chỉ gồm đúng số trang đã redesign, không
lẫn ảnh gốc, và **đã publish**. Nên đừng gộp chung khi dọn.

---

## Đã loại trừ

**Không phải `trim-pdf`.** Đây là giả thuyết đầu tiên và nó sai. `stepTrimPdf` bỏ qua
việc cắt khi không trang nào bị loại và gán thẳng `trimmedPdfUrl = job.sourcePdfUrl`
(`trim-pdf.ts:40`). Job `5a57b956` chính là ca đó — nó gửi **file gốc nguyên vẹn 50
trang** và vẫn nhận 1 trang. Tương quan "2/2 job qua trim-pdf đều hỏng" là ảo.

**Không phải object streams.** PDF cắt ra có `/ObjStm` (mặc định của `pdf-lib.save()`),
bản gốc thì không — nhưng job `0073ffc6` có `/ObjStm=YES` và chạy đủ 43/43.

**Không phải ta poll sớm rồi vơ kết quả dở dang.** Vòng poll trong
`image-provider-diaflow.ts:311` chỉ nhận khi **session** `status === "Done"`, không có
đường chấp nhận partial (`returnPartialOnFailure` chỉ dùng cho nhánh `isFailed`).

**Không phải file PDF hỏng.** Cả `source.pdf` (43 trang) và `source-trimmed.pdf` (42
trang) của `67a6db1f` đều load được bằng `pdf-lib`, đúng số trang, đúng kích thước trang.

### Diaflow tự báo Done với 1 output

Raw result của session `8b1c9f77-c878-46f2-9c35-aa559888b451` (lấy từ log worker):

```
pdf-img-0          status=Successful    → đã tách được ảnh của các trang
loop-0             status=Done
loop-output-0      status=Done
image-generation-0 status=Successful
llm-0              status=Successful
```

Nhưng trong toàn bộ payload chỉ có **duy nhất `loop_0_output`**. Diaflow báo vòng lặp
đã Done sau khi phát ra 1 output. Truncation nằm ở phía họ.

---

## Manh mối chưa kiểm tra được từ code

**1. Hai token one-shot trỏ tới hai flow khác nhau.** `DIAFLOW_ONE_SHOT_TOKENS` trong
`apps/worker/.env.prod` chứa 2 JWT, giải mã ra:

```
flow_code = VcFBppEBsq
flow_code = mGxq2FPld1
```

`diaflow-key-rotation.ts` xoay vòng giữa chúng, nên **flow nào được dùng là do rotation
bốc trúng**. Nếu hai flow không giống hệt nhau — một bản sửa dở, thiếu vòng lặp, hay
cấu hình batch khác — thì kết quả phụ thuộc vào may rủi. **Việc cần làm: mở cả hai
flow trên Diaflow UI và so sánh.** Đây là hướng khả dĩ nhất.

**2. Credit / quota workspace.** Nếu hết credit giữa vòng lặp, flow có thể kết thúc sớm
mà vẫn báo Done. `detectCreditExhaustion()` chỉ bắt được lỗi HTTP lúc tạo session và
lúc poll, không bắt được trường hợp cạn giữa chừng.

**3. Timing trong `.env.prod` khác mặc định của code** (chưa rõ có liên quan không):

| | `.env.prod` | mặc định trong code |
|---|---|---|
| `DIAFLOW_ONE_SHOT_INITIAL_DELAY` | 60 | 2400 |
| `DIAFLOW_ONE_SHOT_POLL_INTERVAL` | 60 | 30 |
| `DIAFLOW_ONE_SHOT_POLL_TIMEOUT` | 2400 | 3600 |

Lưu ý `apps/worker/.env.prod` còn có **key trùng lặp** (`DIAFLOW_POLL_INTERVAL` và
`DIAFLOW_POLL_TIMEOUT` mỗi cái xuất hiện 2 lần với giá trị khác nhau) — nên dọn.

---

## Sửa được đề xuất (chưa viết code)

Guard trong `stepOneShot`, đặt **ngay sau khi có `pages`** (`one-shot.ts:167`) và
**TRƯỚC lệnh ghi cache SourceBook** (`oneShotPages: pages`, dòng 184):

```
sentCount = keptPageNumbers?.length ?? existing.length
if (pages.length < sentCount) → NonRetryableStepError
```

Đặt trước lệnh ghi cache là điểm mấu chốt: kết quả thiếu **không bao giờ được cache**,
nên `/retry` sẽ gọi Diaflow mới chứ không phát lại bản thiếu. Với cache thiếu đã tồn
tại sẵn (2 ca), guard phải xoá cache rồi mới ném, nếu không `/retry` kẹt lỗi vĩnh viễn.

Cần thêm `NonRetryableStepError` trong `retry.ts` để `withRetry` ném lại ngay thay vì
đốt 5 lần — một cú one-shot 42 trang mất **33 phút**, retry 5 lần là quá đắt.

Chỗ đau hiện tại: `one-shot.ts:326` chỉ đếm những gì nhận về.

```js
const attempted = pages.length - unmappedResults;   // = 1 khi Diaflow trả 1 trang
if (errors.length === attempted && attempted > 0) throw ...   // 0 !== 1 → không ném
```

### QUYẾT ĐỊNH CÒN TREO — ngưỡng

| Ngưỡng | Chặn bao nhiêu job lịch sử |
|---|---|
| Chặt (thiếu ≥ 1) | **41/114 = 36%** |
| Thiếu > 3 trang | 6/114 = 5% |

Ban đầu tôi đề xuất chặt khi còn tưởng thiếu là hiếm. Với 36%, chặt nghĩa là hơn một
phần ba job sẽ dừng ở `Lỗi`. Đó có thể vẫn đúng — 1 trang gốc trong sách đem bán vẫn là
1 trang gốc — nhưng là quyết định kinh doanh.

**Và quan trọng: chừng nào Diaflow còn trả 1 trang, guard ở BẤT KỲ ngưỡng nào cũng làm
mọi job confirm rơi vào `Lỗi`.** Pipeline dừng hẳn thay vì đẻ ra rác. Đánh đổi đúng,
nhưng phải biết trước.

### Các quyết định treo khác

1. **Ngưỡng guard** — chặt / thiếu >3 / chỉ cảnh báo không chặn?
2. **41 book đang chứa ảnh gốc** — có liệt kê và xử lý không? Bao nhiêu cái đã `isPublic`?
3. **Dọn 4 ca nặng** — đã chọn "đưa về trạng thái `Lỗi`", nhưng sau đó phát hiện 2 ca
   2026-08-07 là hình thái khác và book đã publish. Đề nghị chỉ dọn 2 ca gần đây
   (`67a6db1f`, `5a57b956`) và báo cáo riêng 2 ca cũ. **Chưa ghi gì vào production.**
4. **Cache SourceBook nhiễm** — `67a6db1f` và `5a57b956` đang có `oneShotPages = 1`.
   Phải xoá, nếu không `/retry` sẽ phát lại đúng 1 trang đó mà không gọi Diaflow.

---

## Việc đã hoàn thành hôm nay (không liên quan tới bug này)

Ba commit, đều đã có test:

| Commit | Nội dung | Đã deploy? |
|---|---|---|
| `3d10d5d` | Classify tab báo cho operator biết cú Xác nhận đã thành công — trước đó im lặng hoàn toàn nên bị hiểu là treo | ✅ |
| `8d78d22` | Banner Lane 2 không còn hứa "không tốn chi phí" trên row đã trả tiền Diaflow rồi (`alreadySpent` do server tính) | ✅ |
| `2a4baf1` | Hiển thị bước **đang chạy** thay vì bước đã xong, kèm đồng hồ `reproduce · 16/40 phút` | ❌ **chưa deploy** |

Test: `@vx/clone-core` 115 → 119, `@vx/coloring` 87 → 104. Bốn failure còn lại
(`cover-source-bw-prompt-template`, 3 cái trong `books/[bookId]/source-covers`) là
pre-existing, đã xác nhận bằng `git stash` rằng chúng tồn tại y hệt trên HEAD sạch.
Worker typecheck cũng có 2 lỗi pre-existing (`step-deps.ts`, `image-provider-diaflow.ts`).

Ngoài ra `898905e` vá lỗ hổng `.gitignore` (thiếu `.env` và `.env*.bak`, cả hai đang
untracked-và-unignored với credential thật).

---

## Bẫy đã biết

**`localhost:3000` KHÔNG phải môi trường tách biệt.** `apps/admin/next.config.ts:27`
mặc định `COLORING_API_UPSTREAM = "https://bookai.lagroups.org"`, nên mọi request
`/coloring-api/*` từ dev server local **proxy thẳng lên production**. Bấm nút ở local
tốn tiền y như bấm trên bookai. Muốn dùng API route local phải chạy:

```bash
COLORING_API_UPSTREAM="" yarn workspace @vx/admin dev
```

**`deploy.sh` đồng bộ working tree, không phải git HEAD.** Nên production có thể đang
chạy code chưa push. Kiểm tra trước khi giả định.

**`apps/worker/.env` từng bị xoá** khỏi working copy ở máy văn phòng vì nó chứa
Diaflow token + R2 key + `DATABASE_URL` production trong khi `.gitignore` chưa cover
`.env` trần. Lỗ hổng gitignore đã vá ở `898905e`, nhưng file có thể vẫn thiếu.

**Một cú Xác nhận đã lỡ bấm vào production hôm nay** trên job `1eb31e9a` (guard chặn
write của tôi dùng sai pattern URL — `/api/clone/...` trong khi thật là
`/coloring-api/clone/...`). Không tốn tiền (Lane 2, chưa spend, gate park lại đúng).
Đã đảo về `awaiting-classify` và gỡ `classifyConfirmed`. Snapshot row trước khi đảo nằm
ở scratchpad của session, không commit.

---

## Trạng thái máy để lại (máy văn phòng)

- Dev server đang chạy ở `:3000` với `COLORING_API_UPSTREAM=""` — **khác mặc định**
- SSH tunnel tới production DB đang mở
- Cả hai an toàn để kill
