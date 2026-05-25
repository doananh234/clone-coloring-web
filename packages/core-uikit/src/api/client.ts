import type { ListParams, PaginatedResponse } from "../types";
import { httpGet, httpPost, httpPut, httpPatch, httpDel } from "./http-client";

function buildQueryString(params: ListParams): string {
  const searchParams = new URLSearchParams();

  if (params.page !== undefined) searchParams.set("page", String(params.page));
  if (params.limit !== undefined)
    searchParams.set("limit", String(params.limit));
  if (params.sort?.length)
    searchParams.set("sort", JSON.stringify(params.sort));
  if (params.filters && Object.keys(params.filters).length > 0)
    searchParams.set("filters", JSON.stringify(params.filters));

  const qs = searchParams.toString();
  return qs ? `?${qs}` : "";
}

export const appApi = {
  get<T>(url: string): Promise<T> {
    return httpGet<T>(url);
  },

  getAll<T>(url: string, params?: ListParams): Promise<PaginatedResponse<T>> {
    const qs = params ? buildQueryString(params) : "";
    return httpGet<PaginatedResponse<T>>(`${url}${qs}`);
  },

  post<T>(url: string, data?: unknown): Promise<T> {
    return httpPost<T>(url, data);
  },

  put<T>(url: string, data?: unknown): Promise<T> {
    return httpPut<T>(url, data);
  },

  patch<T>(url: string, data?: unknown): Promise<T> {
    return httpPatch<T>(url, data);
  },

  delete<T>(url: string, data?: unknown): Promise<T> {
    return httpDel<T>(url, data);
  },
};
