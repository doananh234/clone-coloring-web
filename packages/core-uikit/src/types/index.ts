export type User = {
  id: string;
  email: string;
  name: string;
  avatar?: string;
};

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  meta: PaginationMeta;
};

export type ListParams = {
  page?: number;
  limit?: number;
  filters?: Record<string, unknown>;
  sort?: SortParam[];
};

export type SortParam = {
  field: string;
  order: "asc" | "desc";
};

export type { EntityId, UserId } from "./branded";
export { createId } from "./branded";
export type { ApiErrorType } from "./errors";
export { classifyError } from "./errors";

