# Task hiện tại: (chưa có)

## Các bước

- [ ] 1. ...

## Đã chốt

-

## Lưu ý cho agent tiếp theo

- Import CSV clone jobs: sheet của user dùng header `topicName` / `url`, importer cần `topicName (Brand)` / `book url` (+ `Select`, `Niche`, `Priority`). Luôn chạy `?dryRun=1` trước.
- 13 job pending còn `totalPages = 0` vì link S3 chết (404/400) — chạy lại `count-source-pages.ts` sẽ vẫn lỗi cho tới khi có URL mới.
- 2 job còn trạng thái cũ `awaiting-fill`: không tab nào hiện (tab đó bị 4e1026f xoá), chỉ thấy ở tab "Tất cả".
