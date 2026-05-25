import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { appApi } from "../client";
import { interpolatePath } from "../../utils/interpolate-path";
import type { PaginationMeta, SortParam } from "../../types";
import { notify, notifyError } from "../../notifications";

// --- Types ---

type RestGetAllOptions = {
  entityName: string;
  url: string;
  page?: number;
  limit?: number;
  filters?: Record<string, unknown>;
  sort?: SortParam[];
  enabled?: boolean;
};

type RestGetOneOptions = {
  entityName: string;
  url: string;
  pathParams?: Record<string, string>;
  enabled?: boolean;
};

type NotificationConfig<T> = {
  success?: (result: T) => { title: string; description: string };
  error?: (error: Error) => { title: string; description: string };
};

type RestMutationOptions<T> = {
  entityName: string;
  url: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  pathParams?: Record<string, string>;
  notifications?: NotificationConfig<T>;
};

type RestGetAllInfiniteOptions = {
  entityName: string;
  url: string;
  limit?: number;
  filters?: Record<string, unknown>;
};

// --- Hooks ---

export function useRestGetAll<T>({
  entityName,
  url,
  page = 1,
  limit = 20,
  filters,
  sort,
  enabled = true,
}: RestGetAllOptions) {
  const queryKey = [entityName, "list", page, limit, filters, sort];

  const query = useQuery({
    queryKey,
    queryFn: () => appApi.getAll<T>(url, { page, limit, filters, sort }),
    enabled,
  });

  return {
    data: (query.data?.data ?? []) as T[],
    meta: query.data?.meta as PaginationMeta | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refresh: query.refetch,
  };
}

export function useRestGetOne<T>({
  entityName,
  url,
  pathParams,
  enabled = true,
}: RestGetOneOptions) {
  const resolvedUrl = pathParams ? interpolatePath(url, pathParams) : url;
  const id = pathParams ? Object.values(pathParams)[0] : undefined;
  const queryKey = id ? [entityName, id] : [entityName, resolvedUrl];

  const query = useQuery({
    queryKey,
    queryFn: () => appApi.get<T>(resolvedUrl),
    enabled,
  });

  return {
    data: query.data as T | undefined,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refresh: query.refetch,
  };
}

export function useRestMutation<T>({
  entityName,
  url,
  method,
  pathParams,
  notifications,
}: RestMutationOptions<T>) {
  const queryClient = useQueryClient();
  const resolvedUrl = pathParams ? interpolatePath(url, pathParams) : url;

  const methodMap = {
    POST: appApi.post<T>,
    PUT: appApi.put<T>,
    PATCH: appApi.patch<T>,
    DELETE: appApi.delete<T>,
  };

  const mutation = useMutation({
    mutationFn: (data?: unknown) => methodMap[method](resolvedUrl, data),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [entityName] });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [entityName] });
      if (notifications?.success) {
        const { title, description } = notifications.success(result);
        notify.success(title, { description });
      }
    },
    onError: (error: Error) => {
      queryClient.invalidateQueries({ queryKey: [entityName] });
      if (notifications?.error) {
        const { title, description } = notifications.error(error);
        notify.error(title, { description });
      } else {
        notifyError(error);
      }
    },
  });

  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    data: mutation.data,
    error: mutation.error,
    isLoading: mutation.isPending,
    isSuccess: mutation.isSuccess,
    reset: mutation.reset,
  };
}

export function useRestGetAllInfinite<T>({
  entityName,
  url,
  limit = 20,
  filters,
}: RestGetAllInfiniteOptions) {
  const queryKey = [entityName, "infinite", url, limit, filters];

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      appApi.getAll<T>(url, { page: pageParam as number, limit, filters }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.meta;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];

  return {
    items,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    refresh: query.refetch,
  };
}
