"use client";

import { useEffect } from "react";
import { stripCdnTransform } from "../data/img";

/**
 * Lưới ảnh khắp app đi qua `thumbImg()` → Cloudflare Image Resizing. Khi
 * Cloudflare từ chối biến đổi (hết hạn mức tháng: 429 / ERROR 9422, hoặc tính
 * năng bị tắt), MỌI ảnh hỏng cùng lúc và giao diện trắng trơn.
 *
 * Component này nghe sự kiện `error` của ảnh ở pha capture (sự kiện error của
 * <img> không bubble) và đổi sang URL gốc — ảnh nặng hơn nhưng vẫn hiện. Một
 * listener vá hết ~38 chỗ gọi thumbImg, và tự hết tác dụng khi hạn mức reset.
 * Mỗi ảnh chỉ thử lại đúng một lần (đánh dấu bằng data-img-fallback).
 */
export function ImgCdnFallback() {
  useEffect(() => {
    const onError = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLImageElement)) return;
      if (el.dataset.imgFallback) return;
      const original = stripCdnTransform(el.src);
      if (!original) return;
      el.dataset.imgFallback = "1";
      el.src = original;
    };
    window.addEventListener("error", onError, true);
    return () => window.removeEventListener("error", onError, true);
  }, []);

  return null;
}
