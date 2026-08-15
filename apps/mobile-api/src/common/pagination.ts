const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ListQuery {
  page: number;
  limit: number;
  skip: number;
}

export interface Paginated<T> {
  data: T[];
  meta: { total: number; page: number; limit: number };
}

export function parseListQuery(q: { page?: string; limit?: string }): ListQuery {
  const page = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  const raw = Number.parseInt(q.limit ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.min(MAX_LIMIT, Math.max(1, raw));
  return { page, limit, skip: (page - 1) * limit };
}

export function toPage<T>(data: T[], total: number, q: ListQuery): Paginated<T> {
  return { data, meta: { total, page: q.page, limit: q.limit } };
}

export function parseSort(
  sort: string | undefined,
  allowed: string[],
  fallback: string,
): Record<string, "asc" | "desc"> {
  const [field, dir] = (sort ?? fallback).split(":");
  const f = allowed.includes(field) ? field : fallback.split(":")[0];
  const d = dir === "asc" ? "asc" : "desc";
  return { [f]: d };
}
