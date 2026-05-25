import DOMPurify from "dompurify";

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty);
}

export function maskSensitive(value: string): string {
  if (value.length <= 3) return "*".repeat(value.length);
  return value.slice(0, 3) + "*".repeat(value.length - 3);
}
