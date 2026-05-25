import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: queryClient }, children);
}

export { appApi } from "./client";
export { useRestGetAll, useRestGetOne, useRestMutation, useRestGetAllInfinite } from "./hooks";
export {
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDel,
  setAuthToken,
  getAuthToken,
  clearAuthToken,
  setUnauthorizedCallback,
  setTokenRefreshConfig,
  setTokenStorageStrategy,
  setBaseUrl,
  ApiError,
} from "./http-client";
export { addMiddleware } from "./middleware";
export type { Middleware, RequestContext, ResponseContext } from "./middleware";
