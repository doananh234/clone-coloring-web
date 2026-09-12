# Niche + Priority Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho phép lọc clone jobs và books theo `niche` và `priority` — hai giá trị operator nhập ở CSV nguồn nhưng hiện không tới được hai màn hình đó.

**Architecture:** `CloneJob` nối quan hệ Prisma thật tới `SourceBook` (cột `sourceBookId` và index đã có sẵn trong schema nhưng đang NULL trên cả 2198 rows), nên `SourceBook` là nguồn sự thật duy nhất và không sinh thêm bản sao `niche`. `Book` tiếp tục denormalize vì `Book.niche` operator sửa được và được phép khác nguồn; phần này mở rộng đúng trigger + script backfill đã có, đồng thời bịt lỗ hổng book mới không được gắn niche.

**Tech Stack:** Next.js App Router (API routes), Prisma + Postgres, React + TanStack Query, Vitest.

Spec: `docs/superpowers/specs/2026-09-12-niche-priority-mapping-design.md`

## Global Constraints

- Sentinel cho "chưa gắn giá trị" là chuỗi `__blank__`, dùng chung ở cả jobs lẫn books.
- `priority` giữ kiểu `String?`. Không đổi sang `Int` — sort nằm ngoài phạm vi.
- So khớp niche/priority là **chính xác** (`equals`), không `contains`. Ô search free-text hiện có không đổi hành vi.
- Không đụng BullMQ, không đổi thứ tự worker lấy việc.
- `CloneJob.data.sourceBookId` **giữ nguyên**, không xoá — nhiều chỗ đang đọc nó.
- Cột `Book.niche` và `Book.priority` do trigger Postgres ghi. App chỉ đọc/filter, **không bao giờ ghi trực tiếp** vào hai cột này.
- Test co-located: `foo.test.ts` nằm cạnh `foo.ts`, không gom vào `__tests__/`.
- Deploy chạy `prisma db push --accept-data-loss`, không có migration files. File SQL chạy tay trước khi deploy.
- Mọi commit kết thúc bằng dòng `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `packages/db/prisma/schema.prisma` | Thêm relation `CloneJob.sourceBook`, thêm cột `Book.priority` |
| `packages/db/prisma/clonejob-sourcebook-2026-09.sql` | Backfill `CloneJob.sourceBookId` từ JSON |
| `packages/db/prisma/book-priority-2026-09.sql` | Thêm cột `Book.priority` + mở rộng trigger + seed |
| `apps/admin/src/app/api/clone/import-csv/route.ts` | Ghi `sourceBookId` vào cột scalar cho job mới |
| `apps/admin/src/app/api/clone/filters.ts` | Hàm thuần dựng `where` cho jobs (đơn vị test được) |
| `apps/admin/src/app/api/clone/route.ts` | Nhận param, trả `niche`/`priority`/`total` |
| `apps/admin/src/app/api/clone/facets/route.ts` | Danh sách giá trị cho dropdown |
| `apps/admin/src/app/api/clone/source-tags.ts` | Helper dùng chung: đọc niche/priority theo jobId |
| `apps/admin/src/app/api/clone/[jobId]/{reproduce,confirm,create-book}/route.ts` | Stamp tag lúc tạo book |
| `apps/worker/src/scripts/backfill-book-niche.ts` | Cõng thêm priority |
| `apps/admin/src/app/api/books/{filters.ts,route.ts}` | 2 param filter mới |
| `packages/coloring/src/data/{types,use-clone-jobs,use-books,use-clone-facets}.ts` | Tầng data phía client |
| `packages/coloring/src/screens/{jobs/jobs-screen,books/books-screen}.tsx` | Dropdown + badge |

---

### Task 1: Quan hệ CloneJob ↔ SourceBook

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `CloneJob`, model `SourceBook`)
- Create: `packages/db/prisma/clonejob-sourcebook-2026-09.sql`
- Modify: `apps/admin/src/app/api/clone/import-csv/route.ts` (lời gọi `prisma.cloneJob.create`, quanh dòng 106)

**Interfaces:**
- Consumes: không có (task đầu tiên)
- Produces: `CloneJob.sourceBook` (quan hệ to-one, nullable) và `SourceBook.cloneJobs` (to-many). Task 3, 4, 6 dựa vào relation này.

- [ ] **Step 1: Thêm relation vào schema**

Trong `model CloneJob`, đổi dòng `sourceBookId String?` hiện có thành hai dòng (giữ nguyên vị trí, giữ nguyên toàn bộ `@@index` phía dưới):

```prisma
  sourceBookId   String?
  // Quan hệ thật thay cho việc đọc data->>'sourceBookId'. Cột + index đã tồn
  // tại từ trước nhưng chưa từng được ghi; backfill ở
  // prisma/clonejob-sourcebook-2026-09.sql đổ giá trị từ JSON sang. Khoá JSON
  // được giữ lại cho các chỗ đang đọc nó.
  sourceBook     SourceBook? @relation(fields: [sourceBookId], references: [id])
```

Trong `model SourceBook`, thêm dòng này ngay trước `createdAt`:

```prisma
  cloneJobs        CloneJob[]
```

- [ ] **Step 2: Viết file SQL backfill**

Tạo `packages/db/prisma/clonejob-sourcebook-2026-09.sql`:

```sql
-- CloneJob.sourceBookId backfill (2026-09-12)
--
-- WHY: cột "sourceBookId" và index của nó đã có trong schema từ lâu nhưng route
-- import chỉ ghi giá trị vào data->>'sourceBookId', nên cột NULL trên toàn bộ
-- 2198 rows. Đổ giá trị sang cột để Prisma nối được quan hệ thật tới SourceBook
-- và lọc jobs theo niche/priority bằng join có index.
--
-- AN TOÀN: đã kiểm tra trên prod — 0 bản ghi có data->>'sourceBookId' trỏ tới
-- một SourceBook không tồn tại, nên foreign key mà `prisma db push` tạo ra sau
-- đó sẽ không vi phạm ràng buộc.
--
-- CHẠY TRÊN PROD TRƯỚC KHI DEPLOY:
--   psql "$DIRECT_URL" -f packages/db/prisma/clonejob-sourcebook-2026-09.sql
--
-- Idempotent: chạy lại chỉ không khớp row nào nữa.
UPDATE "CloneJob"
SET "sourceBookId" = data->>'sourceBookId'
WHERE "sourceBookId" IS NULL
  AND data->>'sourceBookId' IS NOT NULL;
```

- [ ] **Step 3: Route import ghi cả cột scalar cho job mới**

Backfill chỉ chữa dữ liệu cũ. Nếu không sửa chỗ này, mọi job import sau đó lại
tiếp tục để cột NULL và biến mất khỏi filter.

Trong `apps/admin/src/app/api/clone/import-csv/route.ts`, ở lời gọi
`prisma.cloneJob.create` (quanh dòng 106), thêm một dòng ngay sau
`sourceFileName: row.fileName,`:

```ts
          // Cột scalar cho quan hệ CloneJob.sourceBook. Khoá trong `data` phía
          // dưới được giữ lại vì nhiều chỗ đang đọc nó.
          sourceBookId: row.id,
```

Giữ nguyên `sourceBookId: row.id` đang có bên trong object `data:` — không xoá.

- [ ] **Step 4: Kiểm tra ràng buộc trước khi áp (phải trả về 0)**

Chạy trên server:

```bash
ssh -o StrictHostKeyChecking=no ec2-user@3.216.170.208 \
  "docker exec vx-postgres psql -U postgres -d coloring -A -t -c \
  \"SELECT count(*) FROM \\\"CloneJob\\\" j WHERE j.data->>'sourceBookId' IS NOT NULL AND NOT EXISTS (SELECT 1 FROM \\\"SourceBook\\\" s WHERE s.id = j.data->>'sourceBookId');\""
```

Expected: `0`

Nếu khác 0: **dừng lại**, báo người dùng. FK sẽ fail khi deploy. Không tự ý xoá dữ liệu.

- [ ] **Step 5: Sinh lại Prisma client và kiểm tra schema hợp lệ**

Run: `cd packages/db && npx prisma validate && npx prisma generate`

Expected: `The schema at prisma/schema.prisma is valid` rồi `Generated Prisma Client`

Nếu gặp `EPERM ... query_engine`: dev server đang giữ file. Tắt `yarn dev` rồi chạy lại.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/clonejob-sourcebook-2026-09.sql apps/admin/src/app/api/clone/import-csv/route.ts
git commit -m "feat(db): real CloneJob -> SourceBook relation + sourceBookId backfill"
```

---

### Task 2: Cột Book.priority + trigger

**Files:**
- Modify: `packages/db/prisma/schema.prisma` (model `Book`)
- Create: `packages/db/prisma/book-priority-2026-09.sql`

**Interfaces:**
- Consumes: không có (độc lập với Task 1)
- Produces: cột `Book.priority String?`, do trigger `book_denorm_perf` ghi từ `data.priority`. Task 8, 9 lọc trên cột này.

- [ ] **Step 1: Thêm cột vào schema**

Trong `model Book`, ngay dưới dòng `niche String?` hiện có, thêm:

```prisma
  // Cùng cơ chế với `niche`: trigger book_denorm_perf copy từ data.priority.
  // App chỉ đọc/filter, không bao giờ ghi trực tiếp cột này.
  priority           String?
```

- [ ] **Step 2: Viết file SQL**

Tạo `packages/db/prisma/book-priority-2026-09.sql`:

```sql
-- Book.priority denormalization (2026-09-12)
--
-- Mở rộng book_denorm_perf (xem books-denorm-2026-08.sql) để cõng thêm
-- data.priority, phục vụ filter priority trên trang Books bằng btree thay vì
-- JSONB path scan. Trigger hiện đã fire trên UPDATE OF "data" nên không cần
-- định nghĩa lại trigger, chỉ thay thân function.
--
-- CHẠY TRÊN PROD TRƯỚC KHI DEPLOY:
--   psql "$DIRECT_URL" -f packages/db/prisma/book-priority-2026-09.sql
-- Không dùng --single-transaction.

ALTER TABLE "Book" ADD COLUMN IF NOT EXISTS "priority" text;

CREATE OR REPLACE FUNCTION book_denorm_perf() RETURNS trigger AS $$
BEGIN
  NEW."interiorPages" := jsonb_array_length(COALESCE(NEW."coloringPages", '[]'::jsonb));
  NEW."niche"    := NULLIF(NEW."data" ->> 'niche', '');
  NEW."priority" := NULLIF(NEW."data" ->> 'priority', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Seed cho rows viết trước khi cột tồn tại. Idempotent.
UPDATE "Book" SET "priority" = NULLIF("data" ->> 'priority', '');
```

- [ ] **Step 3: Kiểm tra schema hợp lệ**

Run: `cd packages/db && npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid`

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/book-priority-2026-09.sql
git commit -m "feat(db): denormalize Book.priority via book_denorm_perf trigger"
```

---

### Task 3: Bộ dựng `where` cho jobs + filtered total

**Files:**
- Create: `apps/admin/src/app/api/clone/filters.ts`
- Create: `apps/admin/src/app/api/clone/filters.test.ts`
- Create: `apps/admin/src/app/api/clone/route.test.ts`
- Modify: `apps/admin/src/app/api/clone/route.ts` (hàm `GET`, dòng 14-81)

**Interfaces:**
- Consumes: `CloneJob.sourceBook` từ Task 1.
- Produces: `BLANK` (hằng `"__blank__"`) và `buildCloneJobWhere({ status, niche, priority })` → `Prisma.CloneJobWhereInput | undefined`. Task 8 dùng lại hằng `BLANK`. Response của `GET /api/clone` thêm trường `total: number | null` và mỗi job thêm `niche`/`priority`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/admin/src/app/api/clone/filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildCloneJobWhere, BLANK } from "./filters";

describe("buildCloneJobWhere", () => {
  it("returns undefined when nothing is filtered", () => {
    expect(buildCloneJobWhere({ status: "all" })).toBeUndefined();
    expect(buildCloneJobWhere({})).toBeUndefined();
  });

  it("filters by status alone", () => {
    expect(buildCloneJobWhere({ status: "pending" })).toEqual({
      AND: [{ status: "pending" }],
    });
  });

  it("matches a concrete niche through the relation", () => {
    expect(buildCloneJobWhere({ niche: "Cozy" })).toEqual({
      AND: [{ sourceBook: { is: { niche: "Cozy" } } }],
    });
  });

  it("matches blank niche via both unlinked jobs and null field", () => {
    expect(buildCloneJobWhere({ niche: BLANK })).toEqual({
      AND: [
        { OR: [{ sourceBookId: null }, { sourceBook: { is: { niche: null } } }] },
      ],
    });
  });

  it("matches blank priority the same way", () => {
    expect(buildCloneJobWhere({ priority: BLANK })).toEqual({
      AND: [
        { OR: [{ sourceBookId: null }, { sourceBook: { is: { priority: null } } }] },
      ],
    });
  });

  it("ANDs status with both tag filters", () => {
    expect(buildCloneJobWhere({ status: "pending", niche: "Film", priority: "1" })).toEqual({
      AND: [
        { status: "pending" },
        { sourceBook: { is: { niche: "Film" } } },
        { sourceBook: { is: { priority: "1" } } },
      ],
    });
  });

  it("ignores empty strings and nulls", () => {
    expect(buildCloneJobWhere({ status: "", niche: "", priority: null })).toBeUndefined();
  });

});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `cd apps/admin && yarn test src/app/api/clone/filters.test.ts`

Expected: FAIL — `Failed to resolve import "./filters"`

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `apps/admin/src/app/api/clone/filters.ts`:

```ts
import type { Prisma } from "@vx/db";

/**
 * Giá trị dropdown gửi lên cho "chưa gắn". Phải khớp cả hai trường hợp: job
 * chưa nối được SourceBook, và job có SourceBook nhưng field null. Lọc quan hệ
 * to-one nullable bằng `is` sẽ loại luôn row có sourceBookId NULL, nên nhánh OR
 * thứ nhất là bắt buộc — và đó là nhánh phủ 2038/2038 job đang pending.
 */
export const BLANK = "__blank__";

type TagField = "niche" | "priority";

function tagClause(field: TagField, value: string): Prisma.CloneJobWhereInput {
  if (value === BLANK) {
    return {
      OR: [
        { sourceBookId: null },
        { sourceBook: { is: field === "niche" ? { niche: null } : { priority: null } } },
      ],
    };
  }
  return {
    sourceBook: { is: field === "niche" ? { niche: value } : { priority: value } },
  };
}

export interface CloneJobFilters {
  status?: string | null;
  niche?: string | null;
  priority?: string | null;
}

/** Dựng `where` cho list jobs. Trả undefined khi không lọc gì (giữ nguyên
 *  đường nhanh cũ: Prisma bỏ qua `where` hoàn toàn). */
export function buildCloneJobWhere(f: CloneJobFilters): Prisma.CloneJobWhereInput | undefined {
  const and: Prisma.CloneJobWhereInput[] = [];
  if (f.status && f.status !== "all") and.push({ status: f.status });
  if (f.niche) and.push(tagClause("niche", f.niche));
  if (f.priority) and.push(tagClause("priority", f.priority));
  return and.length ? { AND: and } : undefined;
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd apps/admin && yarn test src/app/api/clone/filters.test.ts`

Expected: PASS, 7 tests

- [ ] **Step 5: Nối vào route list**

Trong `apps/admin/src/app/api/clone/route.ts`, thêm import ở đầu file:

```ts
import { buildCloneJobWhere } from "./filters";
```

Thay khối từ `const where = ...` tới hết `const [rows, cached] = await Promise.all([...]);` bằng:

```ts
    const niche = url.searchParams.get("niche");
    const priority = url.searchParams.get("priority");
    const where = buildCloneJobWhere({ status, niche, priority });

    // Terminal states are sorted by when they became terminal (updatedAt), so
    // the latest finish/failure is visible at the top. Non-terminal states
    // keep createdAt ordering to reflect queue arrival order.
    const isTerminal = status === "reproduced" || status === "error";
    const orderBy = isTerminal
      ? ({ updatedAt: "desc" } as const)
      : ({ createdAt: "desc" } as const);

    // Tab badges đọc cached counts (theo status, chưa qua filter tag), nên khi
    // có filter tag chúng không còn dùng được để tính số trang. Chỉ khi đó mới
    // trả thêm một count thật — giữ nguyên chi phí của đường không-lọc.
    const hasTagFilter = Boolean(niche || priority);

    const [rows, cached, total] = await Promise.all([
      prisma.cloneJob.findMany({
        where,
        orderBy,
        // List rows never use these heavy Json columns (pages = per-page image
        // data, the bulk of a row) — omit them to cut DB transfer + memory.
        omit: { pages: true, bookData: true },
        include: { sourceBook: { select: { niche: true, priority: true } } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      // Cached, lazily-recomputed counts (≤60s stale) instead of a full groupBy
      // on every request. See packages/db/src/clone-status-counts.ts.
      wantCounts ? readCloneJobStatusCounts(prisma) : Promise.resolve(null),
      hasTagFilter ? prisma.cloneJob.count({ where }) : Promise.resolve(null),
    ]);
```

Trong `rows.map(...)`, thêm hai trường ngay dưới `brand: extra.brand ?? null,`:

```ts
        niche: row.sourceBook?.niche ?? null,
        priority: row.sourceBook?.priority ?? null,
```

Và đổi dòng return cuối của `GET`:

```ts
    return NextResponse.json({ success: true, data: jobs, counts, total });
```

- [ ] **Step 6: Test route — `count` và `findMany` phải dùng CHUNG một `where`**

Đây là chỗ lỗi phân trang thật sự sống. Nếu hai lời gọi nhìn hai tập khác nhau,
số trang sai mà không test nào của builder bắt được.

Tạo `apps/admin/src/app/api/clone/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const findMany = vi.fn();
const count = vi.fn();
const readCounts = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: {
    cloneJob: {
      findMany: (...a: unknown[]) => findMany(...a),
      count: (...a: unknown[]) => count(...a),
    },
  },
  readCloneJobStatusCounts: (...a: unknown[]) => readCounts(...a),
}));
vi.mock("@vx/server-core/r2", () => ({
  getR2Config: vi.fn(),
  createR2Client: vi.fn(),
  uploadToR2: vi.fn(),
  resolveR2Url: vi.fn(),
}));
vi.mock("@vx/server-core/pdf-renderer", () => ({ renderPdfToImages: vi.fn() }));
vi.mock("@/lib/queue/clone-queue", () => ({ cloneQueue: { add: vi.fn() } }));

import { GET } from "./route";

const req = (qs: string) => new NextRequest(`http://localhost/api/clone?${qs}`);

describe("GET /api/clone", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([]);
    count.mockReset().mockResolvedValue(7);
    readCounts.mockReset().mockResolvedValue({ total: 0, counts: {} });
  });

  it("passes the SAME where to findMany and count when filtering", async () => {
    await GET(req("niche=Cozy&status=pending&counts=0"));

    expect(count).toHaveBeenCalledTimes(1);
    const listWhere = findMany.mock.calls[0][0].where;
    const countWhere = count.mock.calls[0][0].where;
    expect(countWhere).toEqual(listWhere);
    expect(listWhere).toEqual({
      AND: [{ status: "pending" }, { sourceBook: { is: { niche: "Cozy" } } }],
    });
  });

  it("returns that filtered total in the response", async () => {
    const res = await GET(req("niche=Cozy&counts=0"));
    expect((await res.json()).total).toBe(7);
  });

  it("skips the count entirely when no tag filter is applied", async () => {
    const res = await GET(req("status=pending&counts=0"));
    expect(count).not.toHaveBeenCalled();
    expect((await res.json()).total).toBeNull();
  });

  it("lifts niche and priority from the joined source book", async () => {
    findMany.mockResolvedValue([
      {
        id: "j1", name: "n", status: "pending", totalPages: 0, analyzedPages: 0,
        bookId: null, error: null, data: {}, createdAt: new Date(), updatedAt: new Date(),
        sourceBook: { niche: "Film", priority: "2" },
      },
    ]);

    const res = await GET(req("counts=0"));
    const job = (await res.json()).data[0];
    expect(job.niche).toBe("Film");
    expect(job.priority).toBe("2");
  });

  it("reports null tags for a job with no source book", async () => {
    findMany.mockResolvedValue([
      {
        id: "j2", name: "n", status: "pending", totalPages: 0, analyzedPages: 0,
        bookId: null, error: null, data: {}, createdAt: new Date(), updatedAt: new Date(),
        sourceBook: null,
      },
    ]);

    const res = await GET(req("counts=0"));
    const job = (await res.json()).data[0];
    expect(job.niche).toBeNull();
    expect(job.priority).toBeNull();
  });
});
```

- [ ] **Step 7: Chạy test route**

Run: `cd apps/admin && yarn test src/app/api/clone/route.test.ts`

Expected: PASS, 5 tests. Nếu module không load được vì thiếu mock, bổ sung mock cho đúng module đó — đừng bỏ bớt assert.

- [ ] **Step 8: Kiểm tra typecheck**

Run: `cd apps/admin && yarn typecheck`

Expected: 0 lỗi (baseline sạch). Nếu `include` báo lỗi cùng `omit`, đó là dấu hiệu Prisma client chưa được sinh lại sau Task 1 — chạy `cd packages/db && npx prisma generate`.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/app/api/clone/filters.ts apps/admin/src/app/api/clone/filters.test.ts apps/admin/src/app/api/clone/route.ts apps/admin/src/app/api/clone/route.test.ts
git commit -m "feat(clone): filter jobs by source niche/priority + filter-aware total"
```

---

### Task 4: Endpoint facets

**Files:**
- Create: `apps/admin/src/app/api/clone/facets/route.ts`
- Create: `apps/admin/src/app/api/clone/facets/route.test.ts`

**Interfaces:**
- Consumes: không gì từ task trước (đọc thẳng `SourceBook`).
- Produces: `GET /api/clone/facets` → `{ niches: string[], priorities: string[] }`, đã sort tăng dần, không chứa null. Task 5 và 9 gọi endpoint này.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/admin/src/app/api/clone/facets/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findMany = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { sourceBook: { findMany: (...a: unknown[]) => findMany(...a) } },
}));

import { GET } from "./route";

describe("GET /api/clone/facets", () => {
  beforeEach(() => findMany.mockReset());

  it("returns distinct niches and priorities without nulls", async () => {
    findMany
      .mockResolvedValueOnce([{ niche: "Cozy" }, { niche: "Film" }])
      .mockResolvedValueOnce([{ priority: "1" }, { priority: "2" }]);

    const res = await GET();
    expect(await res.json()).toEqual({
      niches: ["Cozy", "Film"],
      priorities: ["1", "2"],
    });
  });

  it("returns empty lists rather than failing when nothing is tagged", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const res = await GET();
    expect(await res.json()).toEqual({ niches: [], priorities: [] });
  });

  it("responds 500 when the query throws", async () => {
    findMany.mockRejectedValueOnce(new Error("db down"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `cd apps/admin && yarn test src/app/api/clone/facets/route.test.ts`

Expected: FAIL — không resolve được `./route`

- [ ] **Step 3: Viết implementation**

Tạo `apps/admin/src/app/api/clone/facets/route.ts`:

```ts
import { NextResponse } from "next/server";
import { prisma } from "@vx/db";

export const dynamic = "force-dynamic";

/**
 * Giá trị có thật cho hai dropdown lọc (jobs + books). Đọc DISTINCT từ
 * SourceBook thay vì hardcode: dữ liệu thật có cả "Stoner", "Quote", "Pattern"
 * ngoài danh sách người dùng mô tả ban đầu, hardcode là sót.
 */
export async function GET() {
  try {
    const [niches, priorities] = await Promise.all([
      prisma.sourceBook.findMany({
        where: { niche: { not: null } },
        distinct: ["niche"],
        select: { niche: true },
        orderBy: { niche: "asc" },
      }),
      prisma.sourceBook.findMany({
        where: { priority: { not: null } },
        distinct: ["priority"],
        select: { priority: true },
        orderBy: { priority: "asc" },
      }),
    ]);

    return NextResponse.json({
      niches: niches.map((r) => r.niche).filter((v): v is string => Boolean(v)),
      priorities: priorities.map((r) => r.priority).filter((v): v is string => Boolean(v)),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd apps/admin && yarn test src/app/api/clone/facets/route.test.ts`

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/app/api/clone/facets/
git commit -m "feat(clone): facets endpoint listing real niche/priority values"
```

---

### Task 5: UI trang Clone Jobs

**Files:**
- Modify: `packages/coloring/src/data/types.ts` (interface `CloneJobRow`, interface `CloneJobsResponse`)
- Modify: `packages/coloring/src/data/use-clone-jobs.ts` (toàn bộ)
- Create: `packages/coloring/src/data/use-clone-facets.ts`
- Modify: `packages/coloring/src/data/index.ts`
- Modify: `packages/coloring/src/screens/jobs/jobs-screen.tsx`

**Interfaces:**
- Consumes: `GET /api/clone?niche=&priority=` trả `{ data, counts, total }` (Task 3); `GET /api/clone/facets` (Task 4).
- Produces: `useCloneJobs(status, limit, page, filter)` với `filter: { niche?: string; priority?: string }`, trả thêm `total: number | null`. `useCloneFacets()` trả `{ niches, priorities }` — Task 9 dùng lại.

- [ ] **Step 1: Thêm hai trường vào kiểu dữ liệu dòng job**

Trong `packages/coloring/src/data/types.ts`, thêm vào interface `CloneJobRow`:

```ts
  /** Niche của SourceBook nguồn (qua quan hệ CloneJob.sourceBook). */
  niche?: string | null;
  /** Priority của SourceBook nguồn. */
  priority?: string | null;
```

Và thêm vào interface `CloneJobsResponse`:

```ts
  /** Tổng số job khớp filter tag; null khi request không lọc theo tag. */
  total?: number | null;
```

- [ ] **Step 2: Cho hook nhận filter và trả total**

Thay toàn bộ nội dung `packages/coloring/src/data/use-clone-jobs.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import type { CloneJobsResponse, CloneJobRow } from "./types";
import { COLORING_API_BASE } from "./config";

export interface CloneJobsFilter {
  /** Niche chính xác, hoặc "__blank__" cho job chưa gắn niche. */
  niche?: string;
  /** Priority chính xác, hoặc "__blank__" cho job chưa gắn priority. */
  priority?: string;
}

export interface UseCloneJobsResult {
  jobs: CloneJobRow[];
  /** Rows returned for this page (not the grand total — use `useJobCounts` for totals). */
  count: number;
  /** Tổng số job khớp filter tag, do server đếm. Null khi không lọc theo tag —
   *  lúc đó số trang vẫn lấy từ cached status counts như trước. */
  total: number | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Fetch clone jobs filtered by raw status SERVER-SIDE + paginated. This is the
 * LIST only — it passes `counts=0` so switching tabs/pages never recomputes or
 * clears the summary. The tab badges / totals come from `useJobCounts()`
 * (separate, cached), so they don't flash empty while the list refetches.
 *
 * Filter niche/priority cũng chạy server-side (join sang SourceBook) — lọc phía
 * client sẽ chỉ thấy 50 dòng của trang hiện tại.
 */
export function useCloneJobs(
  status = "all",
  limit = 50,
  page = 1,
  filter: CloneJobsFilter = {},
): UseCloneJobsResult {
  const niche = filter.niche ?? "";
  const priority = filter.priority ?? "";

  const params = new URLSearchParams({ limit: String(limit), page: String(page), counts: "0" });
  if (status !== "all") params.set("status", status);
  if (niche) params.set("niche", niche);
  if (priority) params.set("priority", priority);
  const url = `${COLORING_API_BASE}/clone?${params.toString()}`;

  const query = useQuery({
    queryKey: ["coloring", "clone-jobs", status, limit, page, niche, priority],
    queryFn: () => httpGet<CloneJobsResponse>(url),
  });

  const jobs = query.data?.data ?? [];
  return {
    jobs,
    count: jobs.length,
    total: query.data?.total ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
```

- [ ] **Step 3: Hook đọc facets**

Tạo `packages/coloring/src/data/use-clone-facets.ts`:

```ts
"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";

export interface CloneFacets {
  niches: string[];
  priorities: string[];
}

/** Giá trị có thật cho dropdown lọc. Ít đổi nên cache dài, dùng chung cho cả
 *  trang jobs lẫn trang books. */
export function useCloneFacets(): CloneFacets {
  const query = useQuery({
    queryKey: ["coloring", "clone-facets"],
    queryFn: () => httpGet<CloneFacets>(`${COLORING_API_BASE}/clone/facets`),
    staleTime: 5 * 60 * 1000,
  });
  return { niches: query.data?.niches ?? [], priorities: query.data?.priorities ?? [] };
}
```

Thêm export vào `packages/coloring/src/data/index.ts` cạnh các export hook khác:

```ts
export * from "./use-clone-facets";
```

- [ ] **Step 4: Nối dropdown vào màn hình jobs**

Trong `packages/coloring/src/screens/jobs/jobs-screen.tsx`:

Thêm `Select` vào import UI hiện có (cùng chỗ đang import `Input`/`Tabs`/`Badge`), và thêm import hook:

```ts
import { useCloneFacets } from "../../data/use-clone-facets";
```

Ngay dưới `const [page, setPage] = useQueryNumber("page", 1);` thêm:

```ts
  const [niche] = useQueryParam("niche", "");
  const [priority] = useQueryParam("priority", "");
```

Đổi lời gọi hook list (dòng `const { jobs, isLoading, isError } = useCloneJobs(...)`) thành:

```ts
  const { jobs, total, isLoading, isError } = useCloneJobs(
    activeTab.filter || "all",
    LIMIT,
    page,
    { niche, priority },
  );
  const facets = useCloneFacets();
```

Đổi dòng tính số trang:

```ts
  // Có filter tag thì cached status counts không phản ánh đúng số kết quả nữa,
  // nên dùng total thật do server đếm.
  const totalPages = Math.max(1, Math.ceil((total ?? tabTotal) / LIMIT));
```

Thay khối `<div style={{ width: 260, maxWidth: "100%" }}>...</div>` chứa ô search bằng:

```tsx
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 260, maxWidth: "100%" }}>
            <Input icon="search" placeholder="Tìm job, brand, id…" value={q} onChange={(e) => setParams({ q: e.target.value || null, page: null })} />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={niche}
              onChange={(v) => setParams({ niche: v || null, page: null })}
              options={[
                { label: "Mọi niche", value: "" },
                ...facets.niches.map((n) => ({ label: n, value: n })),
                { label: "Chưa gắn niche", value: "__blank__" },
              ]}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={priority}
              onChange={(v) => setParams({ priority: v || null, page: null })}
              options={[
                { label: "Mọi priority", value: "" },
                ...facets.priorities.map((p) => ({ label: `Priority ${p}`, value: p })),
                { label: "Chưa gắn priority", value: "__blank__" },
              ]}
            />
          </div>
        </div>
```

Thêm hai cột vào `<thead>`, ngay sau `<th style={th}>Nguồn</th>`:

```tsx
                  <th style={th}>Niche</th>
                  <th style={th}>Prio</th>
```

Và hai ô tương ứng trong `<tbody>`, ngay sau ô "Nguồn" của mỗi dòng:

```tsx
                      <td style={td}>{j.niche ? <Badge tone="info">{j.niche}</Badge> : "—"}</td>
                      <td style={td}>{j.priority ? <Badge tone="neutral">{j.priority}</Badge> : "—"}</td>
```

Tăng `minWidth` của bảng từ `1040` lên `1180` để hai cột mới không ép các cột cũ.

- [ ] **Step 5: Chạy test của package để chắc không vỡ gì**

Run: `cd packages/coloring && yarn test`

Expected: PASS toàn bộ. Nếu có test của jobs-screen fail vì cột mới, đọc kỹ diff trước khi sửa test — đừng nới lỏng assert để cho qua.

- [ ] **Step 6: Commit**

```bash
git add packages/coloring/src/data/types.ts packages/coloring/src/data/use-clone-jobs.ts packages/coloring/src/data/use-clone-facets.ts packages/coloring/src/data/index.ts packages/coloring/src/screens/jobs/jobs-screen.tsx
git commit -m "feat(jobs): niche/priority dropdown filters + columns on clone jobs"
```

---

### Task 6: Stamp niche/priority lúc tạo book

**Files:**
- Create: `apps/admin/src/app/api/clone/source-tags.ts`
- Create: `apps/admin/src/app/api/clone/source-tags.test.ts`
- Modify: `apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts` (khối `data:` của `prisma.book.create`, quanh dòng 104-113)
- Modify: `apps/admin/src/app/api/clone/[jobId]/confirm/route.ts` (khối `data:` quanh dòng 136-145)
- Modify: `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` (khối `data:` quanh dòng 147-156)

**Interfaces:**
- Consumes: `CloneJob.sourceBook` từ Task 1.
- Produces: `readSourceTags(jobId: string): Promise<{ niche?: string; priority?: string }>` — chỉ trả khoá có giá trị, không bao giờ trả khoá rỗng.

Đây là phần bịt lỗ hổng: hiện **không có code nào** ghi `Book.data.niche` ngoài script backfill, nên book tạo mới không có niche và filter mục ruỗng dần.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/admin/src/app/api/clone/source-tags.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("@vx/db", () => ({
  prisma: { cloneJob: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import { readSourceTags } from "./source-tags";

describe("readSourceTags", () => {
  beforeEach(() => findUnique.mockReset());

  it("returns both tags when the source book has them", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "Cozy", priority: "1" } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Cozy", priority: "1" });
  });

  it("omits the key entirely when a tag is null", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "Film", priority: null } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Film" });
  });

  it("returns nothing when the job has no source book", async () => {
    findUnique.mockResolvedValue({ sourceBook: null });
    expect(await readSourceTags("j1")).toEqual({});
  });

  it("returns nothing when the job does not exist", async () => {
    findUnique.mockResolvedValue(null);
    expect(await readSourceTags("nope")).toEqual({});
  });

  it("never throws — book creation must not fail over a missing tag", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    findUnique.mockRejectedValue(new Error("db down"));

    expect(await readSourceTags("j1")).toEqual({});
    // Nuốt lỗi nhưng phải để lại dấu vết: book mất tag là truy được nguyên nhân.
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain("j1");

    warn.mockRestore();
  });

  it("trims and drops whitespace-only values", async () => {
    findUnique.mockResolvedValue({ sourceBook: { niche: "  Cozy  ", priority: "   " } });
    expect(await readSourceTags("j1")).toEqual({ niche: "Cozy" });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `cd apps/admin && yarn test src/app/api/clone/source-tags.test.ts`

Expected: FAIL — không resolve được `./source-tags`

- [ ] **Step 3: Viết implementation**

Tạo `apps/admin/src/app/api/clone/source-tags.ts`:

```ts
import { prisma } from "@vx/db";

/**
 * Đọc niche/priority của SourceBook nguồn để stamp vào Book.data lúc tạo book.
 *
 * WHY: trước đây chỉ script backfill mới ghi Book.data.niche, nên mọi book tạo
 * mới đều không có niche và filter trên trang Books mục ruỗng dần theo thời
 * gian. Gọi hàm này ở mọi nơi tạo book từ clone job để backfill trở thành việc
 * chạy một lần cho dữ liệu cũ.
 *
 * Chỉ trả về khoá có giá trị thật — spread một object rỗng vào Book.data sẽ
 * không tạo ra khoá rỗng, và trigger book_denorm_perf sẽ để cột scalar NULL.
 *
 * Không bao giờ ném lỗi: thiếu một cái tag không đáng làm hỏng việc tạo book.
 * Nhưng có log — book mới bỗng dưng mất tag phải truy được về nguyên nhân,
 * chứ không im lặng biến mất.
 */
export async function readSourceTags(
  jobId: string,
): Promise<{ niche?: string; priority?: string }> {
  try {
    const row = await prisma.cloneJob.findUnique({
      where: { id: jobId },
      select: { sourceBook: { select: { niche: true, priority: true } } },
    });

    const out: { niche?: string; priority?: string } = {};
    const niche = row?.sourceBook?.niche?.trim();
    const priority = row?.sourceBook?.priority?.trim();
    if (niche) out.niche = niche;
    if (priority) out.priority = priority;
    return out;
  } catch (error) {
    console.warn(
      `[source-tags] không đọc được tag của job ${jobId}; book sẽ được tạo không có niche/priority:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd apps/admin && yarn test src/app/api/clone/source-tags.test.ts`

Expected: PASS, 6 tests

- [ ] **Step 5: Gọi helper ở cả ba nơi tạo book**

Ở **mỗi** file trong ba file dưới đây, thêm import:

```ts
import { readSourceTags } from "../../source-tags";
```

rồi ngay trước lời gọi `prisma.book.create(...)` tương ứng, thêm:

```ts
  const sourceTags = await readSourceTags(jobId);
```

và trong object `data:` **lồng bên trong** của book (object đang chứa `cloneJobId: jobId`), thêm ngay sau dòng `cloneJobId: jobId,`:

```ts
        ...sourceTags,
```

Ba vị trí:
1. `apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts` — `prisma.book.create` quanh dòng 95, khoá `cloneJobId` ở dòng 113.
2. `apps/admin/src/app/api/clone/[jobId]/confirm/route.ts` — `prisma.book.create` quanh dòng 128, khoá `cloneJobId` ở dòng 145.
3. `apps/admin/src/app/api/clone/[jobId]/create-book/route.ts` — `prisma.book.create` quanh dòng 134, khoá `cloneJobId` ở dòng 156.

Lưu ý: `...sourceTags` phải nằm trong `data` **của Book** (object có `cloneJobId`), không phải `data` ngoài cùng của lời gọi `create`.

- [ ] **Step 6: Chạy toàn bộ test của admin**

Run: `cd apps/admin && yarn test`

Expected: PASS toàn bộ, gồm cả `reproduce/route.test.ts` và `apply-candidate/route.test.ts` có sẵn. Nếu test reproduce fail vì mock `@vx/db` thiếu `cloneJob.findUnique`, bổ sung mock đó — đừng nới lỏng assert.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/api/clone/source-tags.ts apps/admin/src/app/api/clone/source-tags.test.ts "apps/admin/src/app/api/clone/[jobId]/reproduce/route.ts" "apps/admin/src/app/api/clone/[jobId]/confirm/route.ts" "apps/admin/src/app/api/clone/[jobId]/create-book/route.ts"
git commit -m "fix(books): stamp source niche/priority when a book is created"
```

---

### Task 7: Backfill script cõng thêm priority

**Files:**
- Modify: `apps/worker/src/scripts/backfill-book-niche.ts`

**Interfaces:**
- Consumes: `Book.data.priority` được trigger từ Task 2 copy sang cột scalar.
- Produces: script ghi cả `data.niche`, `data.nicheLower` và `data.priority` cho book cũ.

- [ ] **Step 1: Mở rộng phần đọc SourceBook**

Đổi lời gọi `db.sourceBook.findMany` (quanh dòng 69) và khối map ngay sau nó:

```ts
  const sourceBooks = await db.sourceBook.findMany({
    where: { id: { in: [...sourceBookIds] } },
    select: { id: true, niche: true, priority: true },
  });
  const tagsBySourceBook = new Map<string, { niche?: string; priority?: string }>();
  for (const sb of sourceBooks) {
    const tags: { niche?: string; priority?: string } = {};
    const n = str(sb.niche);
    const p = str(sb.priority);
    if (n) tags.niche = n;
    if (p) tags.priority = p;
    if (n || p) tagsBySourceBook.set(sb.id, tags);
  }
```

- [ ] **Step 2: Mở rộng vòng lặp ghi**

Thay khối từ `const niche = sbId ? ...` tới `data.nicheLower = nicheLower;` bằng:

```ts
    const tags = sbId ? tagsBySourceBook.get(sbId) : undefined;
    const niche = tags?.niche;
    const priority = tags?.priority;

    if (!niche && !priority) {
      skippedNoNiche++;
      continue;
    }

    const nicheLower = niche?.toLowerCase();
    const nicheSame = !niche || (str(data.niche) === niche && str(data.nicheLower) === nicheLower);
    const prioritySame = !priority || str(data.priority) === priority;
    if (nicheSame && prioritySame) {
      skippedUnchanged++;
      continue;
    }

    if (niche) {
      data.niche = niche;
      data.nicheLower = nicheLower;
    }
    if (priority) data.priority = priority;
```

Và đổi dòng `log(...)` ngay dưới đó:

```ts
    log(
      `FIX  ${book.id} "${String(book.title).slice(0, 30)}" — ` +
        `niche=${niche ? `"${niche}"` : "—"} priority=${priority ? `"${priority}"` : "—"}`,
    );
```

- [ ] **Step 3: Cập nhật docblock đầu file**

Đổi ba dòng đầu của docblock thành:

```ts
/**
 * Denormalize niche + priority của SourceBook nguồn lên Book.data (`niche`,
 * `nicheLower` cho tìm kiếm không phân biệt hoa thường, và `priority`) để trang
 * Books lọc/hiển thị được mà không cần join mỗi request.
```

và sửa dòng lineage cuối của khối `Niche lineage` thành:

```ts
 *       -> SourceBook.niche / SourceBook.priority
```

- [ ] **Step 4: Chạy dry-run để kiểm chứng**

Run: `cd apps/worker && yarn backfill:niche --limit 5`

Expected: in ra các dòng `[backfill-niche] [dry-run] FIX ...` kèm cả `niche=` và `priority=`, và **không ghi gì** vào DB.

Nếu lỗi kết nối DB, đó là môi trường local thiếu tunnel — không phải lỗi code. Ghi lại và chuyển sang bước sau.

- [ ] **Step 5: Typecheck**

Run: `cd apps/worker && npx tsc --noEmit`

Expected: không lỗi

- [ ] **Step 6: Commit**

```bash
git add apps/worker/src/scripts/backfill-book-niche.ts
git commit -m "feat(backfill): carry source priority alongside niche onto books"
```

---

### Task 8: Filter niche/priority cho API Books

**Files:**
- Create: `apps/admin/src/app/api/books/filters.ts`
- Create: `apps/admin/src/app/api/books/filters.test.ts`
- Modify: `apps/admin/src/app/api/books/route.ts` (hàm `GET`, khối dựng `and` + khối `rows.map`)

**Interfaces:**
- Consumes: cột `Book.niche`, `Book.priority` từ Task 2; hằng `BLANK` từ Task 3.
- Produces: `bookTagClause(field, value)` → `Prisma.BookWhereInput`. `GET /api/books` nhận `?niche=` và `?priority=`, và mỗi book trả thêm `priority`.

- [ ] **Step 1: Viết test thất bại**

Tạo `apps/admin/src/app/api/books/filters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { bookTagClause } from "./filters";
import { BLANK } from "../clone/filters";

describe("bookTagClause", () => {
  it("matches a concrete niche on the denormalized column", () => {
    expect(bookTagClause("niche", "Cozy")).toEqual({ niche: "Cozy" });
  });

  it("matches a concrete priority", () => {
    expect(bookTagClause("priority", "1")).toEqual({ priority: "1" });
  });

  it("maps the blank sentinel to a null column check", () => {
    expect(bookTagClause("niche", BLANK)).toEqual({ niche: null });
    expect(bookTagClause("priority", BLANK)).toEqual({ priority: null });
  });
});
```

- [ ] **Step 2: Chạy test để xác nhận nó fail**

Run: `cd apps/admin && yarn test src/app/api/books/filters.test.ts`

Expected: FAIL — không resolve được `./filters`

- [ ] **Step 3: Viết implementation**

Tạo `apps/admin/src/app/api/books/filters.ts`:

```ts
import type { Prisma } from "@vx/db";
import { BLANK } from "../clone/filters";

/**
 * Lọc book theo tag. Khác phía jobs ở chỗ đây là cột scalar denormalized
 * (do trigger book_denorm_perf ghi) chứ không phải quan hệ, nên blank chỉ là
 * một phép so null đơn giản — không cần nhánh OR.
 */
export function bookTagClause(
  field: "niche" | "priority",
  value: string,
): Prisma.BookWhereInput {
  const match = value === BLANK ? null : value;
  return field === "niche" ? { niche: match } : { priority: match };
}
```

- [ ] **Step 4: Chạy test để xác nhận pass**

Run: `cd apps/admin && yarn test src/app/api/books/filters.test.ts`

Expected: PASS, 3 tests

- [ ] **Step 5: Nối vào route books**

Thêm import ở đầu `apps/admin/src/app/api/books/route.ts`:

```ts
import { bookTagClause } from "./filters";
```

Ngay sau khối `if (interior === "gt40") { ... }`, thêm:

```ts
  // Tag từ CSV nguồn, denormalized sang cột scalar bởi trigger book_denorm_perf
  // nên đây là so khớp btree chứ không phải JSONB path scan.
  const niche = (searchParams.get("niche") || "").trim();
  if (niche) and.push(bookTagClause("niche", niche));
  const priority = (searchParams.get("priority") || "").trim();
  if (priority) and.push(bookTagClause("priority", priority));
```

Trong `rows.map(...)`, đổi dòng `niche:` hiện có và thêm `priority`, ưu tiên cột scalar (bản trigger giữ đồng bộ) rồi mới tới JSON:

```ts
      niche: b.niche ?? (b.data as { niche?: unknown } | null)?.niche ?? null,
      priority: b.priority ?? null,
```

Không cần sửa gì cho phân trang: `prisma.book.count({ where })` ở đó đã dùng chung `where`.

- [ ] **Step 6: Typecheck + toàn bộ test admin**

Run: `cd apps/admin && npx tsc --noEmit && yarn test`

Expected: không lỗi type, test PASS toàn bộ

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/api/books/filters.ts apps/admin/src/app/api/books/filters.test.ts apps/admin/src/app/api/books/route.ts
git commit -m "feat(books): filter library by niche/priority"
```

---

### Task 9: UI trang Books

**Files:**
- Modify: `packages/coloring/src/data/types.ts` (interface `BookRow`)
- Modify: `packages/coloring/src/data/use-books.ts` (interface `BooksFilter` + hàm `useBooks`)
- Modify: `packages/coloring/src/screens/books/books-screen.tsx`

**Interfaces:**
- Consumes: `GET /api/books?niche=&priority=` (Task 8); `useCloneFacets()` (Task 5).
- Produces: `BooksFilter` thêm `niche?` và `priority?`.

- [ ] **Step 1: Thêm priority vào kiểu dòng book**

Trong `packages/coloring/src/data/types.ts`, ngay dưới trường `niche` của `BookRow` (có comment "Denormalized source niche"), thêm:

```ts
  /** Denormalized source priority (từ CloneJob → SourceBook), hiện làm tag. */
  priority?: string | null;
```

- [ ] **Step 2: Cho useBooks nhận hai filter mới**

Trong `packages/coloring/src/data/use-books.ts`, thêm vào interface `BooksFilter`:

```ts
  /** Niche chính xác, hoặc "__blank__" cho sách chưa gắn niche. */
  niche?: string;
  /** Priority chính xác, hoặc "__blank__" cho sách chưa gắn priority. */
  priority?: string;
```

Trong thân `useBooks`, sau dòng `const interior = ...`, thêm:

```ts
  const niche = filter.niche ?? "";
  const priority = filter.priority ?? "";
```

Thêm hai giá trị vào `queryKey`:

```ts
    queryKey: ["coloring", "books", page, limit, q, cat, status, assign, assignee, etsy, interior, niche, priority],
```

Và trong `queryFn`, sau `if (interior) params.set("interior", interior);`:

```ts
      if (niche) params.set("niche", niche);
      if (priority) params.set("priority", priority);
```

- [ ] **Step 3: Thêm dropdown + badge vào màn hình books**

Trong `packages/coloring/src/screens/books/books-screen.tsx`:

Thêm import hook:

```ts
import { useCloneFacets } from "../../data/use-clone-facets";
```

Cạnh các dòng `useQueryParam` hiện có (dòng 62-65), thêm:

```ts
  const [niche] = useQueryParam("niche", "");
  const [priority] = useQueryParam("priority", "");
  const facets = useCloneFacets();
```

Truyền hai filter mới vào object filter của lời gọi `useBooks(...)` hiện có: thêm `niche, priority`.

Trong hàng filter (ngay sau `<Select ... value={interior} ... />`), thêm hai dropdown:

```tsx
          <div style={{ width: 160 }}>
            <Select
              value={niche}
              onChange={(v) => setParams({ niche: v || null, page: null })}
              options={[
                { label: "Mọi niche", value: "" },
                ...facets.niches.map((n) => ({ label: n, value: n })),
                { label: "Chưa gắn niche", value: "__blank__" },
              ]}
            />
          </div>
          <div style={{ width: 160 }}>
            <Select
              value={priority}
              onChange={(v) => setParams({ priority: v || null, page: null })}
              options={[
                { label: "Mọi priority", value: "" },
                ...facets.priorities.map((p) => ({ label: `Priority ${p}`, value: p })),
                { label: "Chưa gắn priority", value: "__blank__" },
              ]}
            />
          </div>
```

Nếu file chưa có `setParams`, thêm `const setParams = useSetQueryParams();` cạnh các hook khác và import `useSetQueryParams` từ cùng module với `useQueryParam`.

Cạnh badge niche đang có (dòng 49, `{book.niche && <Badge tone="info">{book.niche}</Badge>}`), thêm:

```tsx
        {book.priority && <Badge tone="neutral">P{book.priority}</Badge>}
```

- [ ] **Step 4: Chạy test package**

Run: `cd packages/coloring && yarn test`

Expected: PASS toàn bộ

- [ ] **Step 5: Commit**

```bash
git add packages/coloring/src/data/types.ts packages/coloring/src/data/use-books.ts packages/coloring/src/screens/books/books-screen.tsx
git commit -m "feat(books): niche/priority dropdown filters + priority badge"
```

---

## Rollout

Thứ tự bắt buộc — hai file SQL chạy **trước** khi deploy, vì `prisma db push` sẽ thêm foreign key và cột dựa trên schema mới:

1. `scp` `.env.prod` của cả ba app từ server về local trước (deploy ghi đè server bằng bản local).
2. Chạy `packages/db/prisma/clonejob-sourcebook-2026-09.sql` trên prod.
3. Chạy `packages/db/prisma/book-priority-2026-09.sql` trên prod.
4. Deploy (`./deploy.sh`) — `prisma db push` thêm FK + cột.
5. Chạy `yarn backfill:niche --apply` trong container worker để đổ tag cho book cũ.
6. Kiểm chứng: mở trang Clone Jobs, chọn "Chưa gắn niche" → phải ra đúng 2038 job pending; chọn "Cozy" → phải ra 98 job.

## Kiểm chứng sau cùng

```bash
cd apps/admin && yarn test
cd ../worker && npx tsc --noEmit
cd ../../packages/coloring && yarn test
```

Tất cả phải PASS trước khi coi là xong.
