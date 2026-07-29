"use client";

import { httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

/** Read a File as a base64 data URL (for /generate/upload-image). */
export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Đọc file thất bại"));
    reader.readAsDataURL(file);
  });

/**
 * Upload a local image File to R2 via /generate/upload-image and return its public
 * URL. Shared by every "upload instead of paste-a-link" flow (extract, style test, …).
 */
export async function uploadImageFile(file: File, keyPrefix = "uploads"): Promise<string> {
  if (!COLORING_WRITE_ENABLED) throw new Error("Chỉ chạy ở chế độ ghi thật (staging).");
  const base64 = await fileToBase64(file);
  const ext = file.name.toLowerCase().endsWith(".png")
    ? "png"
    : file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "png";
  const key = `${keyPrefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await httpPost<{ success?: boolean; url?: string }>(
    `${COLORING_API_BASE}/generate/upload-image`,
    { base64, key },
  );
  if (!res?.url) throw new Error("Upload ảnh thất bại.");
  return res.url;
}
