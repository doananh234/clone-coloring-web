# Task hiện tại: Ảnh trắng toàn site — Cloudflare Image Transformations hết hạn mức

Prod: mọi URL `/cdn-cgi/image/...` trả 429 `ERROR 9422: Free unique transformations by account has been exhausted`.
Ảnh gốc trên R2 vẫn 200. Backfill source-cover (126 bìa URL mới × nhiều width) làm tràn hạn mức.
Branch: `fix/img-cdn-fallback`. User chọn hướng A: fallback về ảnh gốc khi CDN lỗi.

## Các bước

- [ ] 1. `stripCdnTransform(url)` trong `packages/coloring/src/data/img.ts` + test
- [ ] 2. Component `ImgCdnFallback` (listener 'error' capture ở window, đổi src ảnh lỗi sang bản gốc, chống lặp) + test jsdom
- [ ] 3. Mount trong shell của coloring app + verify (test, tsc)
- [ ] 4. User review → merge/deploy → kiểm tra ảnh hiện lại trên prod

## Đã chốt

- Không sửa 38 chỗ gọi `thumbImg`: một listener capture ở tầng app vá hết, và tự hết tác dụng khi hạn mức reset.
- Hướng B (tự sinh thumbnail bằng `sharp`, bỏ CDN) để sau — user đồng ý A trước.

## Lưu ý cho agent tiếp theo

- Hạn mức là "unique transformations / tài khoản / tháng" → mỗi URL ảnh MỚI đều tốn quota. Cân nhắc điều này trước khi viết backfill đổi hàng loạt URL ảnh.
