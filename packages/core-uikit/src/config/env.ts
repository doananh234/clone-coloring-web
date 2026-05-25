export function getEnv(key: string, fallback?: string): string {
  const value =
    typeof import.meta !== "undefined"
      ? (import.meta as Record<string, Record<string, string>>).env?.[key]
      : undefined;
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable: ${key}`);
}

export function getApiBaseUrl(): string {
  return getEnv("VITE_API_BASE_URL", "http://localhost:3000");
}
