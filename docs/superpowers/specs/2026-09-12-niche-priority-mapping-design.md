# Mapping `niche` + `priority` từ SourceBook sang CloneJob và Book

Ngày: 2026-09-12

## Mục tiêu

Cho phép lọc clone jobs và books theo `niche` và `priority` — hai giá trị
operator nhập ở file CSV nguồn nhưng hiện không đi tới được hai màn hình đó.

Phạm vi: **chỉ lọc và hiển thị**. Không đổi thứ tự worker lấy việc, không đụng
BullMQ.

## Hiện trạng (khảo sát trên prod 2026-09-12)

| | `niche` | `priority` |
|---|---|---|
| `SourceBook` | cột scalar, 131/2198 rows có giá trị | cột scalar, 99/2198 rows |
| `CloneJob` | không có | không có |
| `Book` | `data.niche` + cột scalar + trigger + backfill + badge + search | không có |

- Một lần import duy nhất: `List books clone - find_query.csv.csv@2026-06-29`, 2194 rows.
- Giá trị niche thực tế: Cozy 98, Pattern 15, Film 9, Stoner 7, Cozy Pattern 1, Quote 1.
- `priority` chỉ tồn tại ở `SourceBook.priority`, parser CSV
  (`apps/admin/src/lib/csv/parse-source-books.ts`) và `knownFields` của route import.
- Lineage đã được code hoá trong `apps/worker/src/scripts/backfill-book-niche.ts`:
  `Book.data.cloneJobId → CloneJob.data.sourceBookId → SourceBook.niche`.
- `Book.niche` đã populate trên prod: 115/132 books.
- **`CloneJob.sourceBookId` (cột scalar, đã có `@@index`) NULL trên cả 2198 rows**,
  trong khi `data->>'sourceBookId'` có đủ 2198. Route import ghi vào JSON, bỏ trống cột.
- **0 bản ghi mồ côi**: mọi `data->>'sourceBookId'` đều trỏ tới một `SourceBook` có thật,
  nên thêm foreign key là an toàn.

## Quyết định thiết kế

**CloneJob dùng quan hệ thật, Book dùng denormalize.**

Hai bên khác nhau là có lý do: `Book.niche` operator sửa được trong
`book-edit-screen.tsx`, tức bản copy được phép khác nguồn — denormalize ở đó là
cố ý. `CloneJob` thì không có nhu cầu đó, nên nối thẳng quan hệ để `SourceBook`
là nguồn sự thật duy nhất, tránh sinh ra bản sao thứ ba của `niche`.

Đã cân nhắc và loại:
- *Denormalize vào `CloneJob.data`*: khớp pattern `brand`/`thumbnailUrl` sẵn có,
  nhưng filter JSONB không dùng được btree và dữ liệu bị nhân bản.
- *Thêm cột scalar vào `CloneJob`*: query nhanh nhất nhưng nhiều schema churn nhất
  và thành 3 bản sao niche cần giữ đồng bộ.

## 1. Tầng dữ liệu

Không thêm cột, không thêm index — cả hai đã có sẵn.

```prisma
model CloneJob {
  sourceBookId String?
  sourceBook   SourceBook? @relation(fields: [sourceBookId], references: [id])
}

model SourceBook {
  cloneJobs CloneJob[]
}
```

Backfill (idempotent, chạy trước deploy):

```sql
UPDATE "CloneJob" SET "sourceBookId" = data->>'sourceBookId'
WHERE "sourceBookId" IS NULL AND data->>'sourceBookId' IS NOT NULL;
```

`data.sourceBookId` **giữ nguyên**, không xoá: `apps/admin/src/app/api/clone/route.ts`
và các chỗ khác đang đọc nó. Cột scalar thành tay cầm để query; JSON ở lại cho
tương thích ngược.

`apps/admin/src/app/api/clone/import-csv/route.ts` sửa để ghi cả cột scalar lẫn
khoá JSON cho job mới.

Thứ tự rollout: chạy SQL backfill trước, rồi deploy (deploy tự chạy
`prisma db push --accept-data-loss` để thêm FK). FK chấp nhận NULL nên hai bước
không phụ thuộc chặt nhau, nhưng backfill trước thì FK validate dữ liệu thật ngay.

## 2. API Clone Jobs — `apps/admin/src/app/api/clone/route.ts`

Nhận thêm `?niche=` và `?priority=`:

- Giá trị thường → `where.sourceBook = { niche: <v> }` (so khớp chính xác, không `contains`).
- Sentinel `__blank__` → khớp job không có giá trị. Phải bao cả hai trường hợp:
  job chưa nối `sourceBook`, và job có `sourceBook` nhưng field null:
  `{ OR: [{ sourceBookId: null }, { sourceBook: { niche: null } }] }`.
  Đây là nhánh quan trọng nhất — 2038/2038 job `pending` đều blank.
- Hai filter kết hợp AND với nhau và AND với tab status hiện hành.

Trả `niche`/`priority` mỗi dòng qua
`include: { sourceBook: { select: { niche: true, priority: true } } }`, lift lên
top-level trong `jobs.map(...)` giống cách `brand`/`thumbnailUrl` đang được lift.

**Sửa lỗi bắt buộc đi kèm:** response phải thêm `total` đã lọc từ
`prisma.cloneJob.count({ where })`. Hiện `totalPages` được tính ở
`jobs-screen.tsx` từ cached status counts (`countFor(activeTab, counts)`), tức
con số **chưa** qua filter — bật filter niche lên là số trang sai ngay. Đây đúng
là cách `apps/admin/src/app/api/books/route.ts` đã làm. Tab badges vẫn đọc cache
như cũ, không đổi.

## 3. UI Clone Jobs — `packages/coloring/src/screens/jobs/jobs-screen.tsx`

- Hai dropdown đặt cùng hàng với ô search, dưới hàng tab status.
- URL-backed bằng `useQueryParam` giống `tab`/`q`/`page`, nên reload và share link giữ nguyên filter.
- Đổi filter → reset `page` về 1 (dùng `setParams({ ..., page: null })` như `changeTab` đang làm).
- Bảng thêm 2 cột badge: Niche, Prio.
- `totalPages` lấy từ `total` đã lọc khi có filter; không có filter thì giữ nguyên
  đường cũ qua cached counts.

## 4. Trang Books

Mở rộng pattern sẵn có, không phát minh mới.

`priority` giữ nguyên kiểu `String?` như `SourceBook.priority`. Không đổi sang
`Int`: sort nằm ngoài phạm vi, và giá trị hiện chỉ là "1"/"2".

### 4a. Bịt lỗ hổng book mới

Hiện **không có code nào ghi `Book.data.niche`** ngoài script backfill — đã grep
toàn bộ `apps/worker/src`, không có kết quả nào khác. Nghĩa là book tạo sau lần
chạy backfill gần nhất sẽ không có niche, và filter mục ruỗng dần. Đây nhiều khả
năng là nguyên nhân 17/132 books trên prod đang null.

Ba nơi tạo book từ clone job phải stamp `niche` + `priority` vào `Book.data`
ngay lúc tạo, đọc từ `job.sourceBook` qua relation mới:

- `apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts`
- `apps/admin/src/app/api/clone/[jobId]/confirm/route.ts`
- `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts`

Trigger sẽ tự copy từ `data` sang cột scalar, nên không cần ghi cột trực tiếp.
Sau thay đổi này, backfill trở thành việc chạy một lần cho dữ liệu cũ thay vì
việc lặp lại định kỳ.

### 4b. Cột + trigger + backfill

- `packages/db/prisma/schema.prisma`: thêm `priority String?` vào `Book`, kèm
  comment nói rõ cột do trigger ghi, app chỉ đọc (giống `niche`/`interiorPages`).
- Trigger `book_denorm_perf`: thêm
  `NEW."priority" := NULLIF(NEW."data" ->> 'priority', '');`
  Viết thành file SQL mới đặt cạnh `packages/db/prisma/books-denorm-2026-08.sql`,
  gồm `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`,
  và một `UPDATE` seed cho rows cũ. Trigger hiện đã fire trên `UPDATE OF data`
  nên không cần đổi định nghĩa trigger.
- `apps/worker/src/scripts/backfill-book-niche.ts`: cõng thêm `priority` theo đúng
  lineage đang dùng cho `niche`, giữ nguyên cơ chế dry-run mặc định + `--apply`.

### 4c. API + UI

- `apps/admin/src/app/api/books/route.ts`: thêm 2 param theo đúng khuôn
  `and.push(...)` sẵn có, so khớp chính xác trên cột scalar, cùng sentinel
  `__blank__` như phía jobs. `prisma.book.count({ where })` ở đó vốn đã
  filter-aware nên phân trang không phải sửa.
- `books-screen.tsx`: hai dropdown + badge priority cạnh badge niche đang có.

## 5. Nguồn giá trị cho dropdown

Một endpoint dùng chung cho cả hai trang: `GET /api/clone/facets`, trả
`{ niches: string[], priorities: string[] }` bằng `DISTINCT` trên `SourceBook`
(2198 rows, truy vấn không đáng kể).

**Không hardcode danh sách** — dữ liệu thật có `Stoner`, `Quote`, `Pattern` không
nằm trong mô tả ban đầu, hardcode là sót. Mỗi dropdown luôn có thêm mục "Tất cả"
và mục blank.

## Kiểm thử

Test co-located theo convention repo (`foo.test.ts` cạnh `foo.ts`):

- Builder `where` cho jobs: giá trị thường, sentinel blank (cả hai nhánh OR),
  kết hợp với filter status.
- `total` đã lọc: khẳng định `count` dùng cùng `where` với `findMany`.
- Backfill `sourceBookId`: chạy hai lần cho cùng kết quả, không đụng row đã có giá trị.
- Backfill priority của book: book không có lineage thì bỏ qua, không ghi rỗng.
- Stamp lúc tạo book (4a): book tạo từ job có `sourceBook` thì `data.niche` +
  `data.priority` được ghi; job không có `sourceBook` thì không ghi khoá rỗng.

## Ngoài phạm vi

Ghi lại để quyết riêng, không làm trong đợt này:

- 2 job status `awaiting-fill` không nằm trong `countKeys` của tab nào, và chuỗi
  `"awaiting-fill"` không xuất hiện ở đâu trong `apps/` lẫn `packages/` — dữ liệu
  mồ côi từ luồng đã gỡ. Chỉ hiện ở tab "Tất cả" với nhãn thô.
- `brandId` chỉ có trên 4/2198 rows vì `resolveBrandId()` được thêm sau lần import
  2026-06-29. Theo comment trong chính route đó, worker ở bước cover sẽ fallback
  sang lookup theo tên case-sensitive và "silently misses".
- `orderBy` của list jobs chỉ có một cột, không có tiebreaker. Hiện chưa gây lỗi
  (đã kiểm tra: 0 cặp row trùng `createdAt`).
