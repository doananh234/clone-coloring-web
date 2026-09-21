# Task hiện tại: Clone jobs — search mượt + search server-side + lọc theo nguồn

Branch: `feat/jobs-search-source`. Spec: `docs/superpowers/specs/2026-09-21-jobs-search-source-design.md`

## Các bước

- [x] 1. API filter: `q` + `source` trong `apps/admin/src/app/api/clone/filters.ts` + `route.ts` (raw ILIKE lấy id theo brand, đếm total khi có q/source) + test
- [x] 2. facets trả `sources` (`apps/admin/src/app/api/clone/facets/route.ts`) + test; type `CloneFacets` ở `packages/coloring/src/data/use-clone-facets.ts`
- [ ] 3. Client: `use-clone-jobs.ts` nhận q/source + keepPreviousData; `jobs-screen.tsx` input state local + debounce 300ms, bỏ lọc client (trừ job nháp local), thêm Select nguồn
- [ ] 4. Verify: `yarn workspace @vx/admin test`, `yarn typecheck`, thử tay trên màn Clone jobs

## Đã chốt

- Search nguồn dùng `$queryRaw` ILIKE → id list vì Prisma JSON filter không có insensitive; không thêm migration.
- Dropdown nguồn dùng `Select` native như niche/priority; không có option "Chưa có nguồn".

## Lưu ý cho agent tiếp theo

- Admin đã có sẵn vài test fail và worker có ~19 lỗi tsc từ trước; chỉ quan tâm lỗi mới.
