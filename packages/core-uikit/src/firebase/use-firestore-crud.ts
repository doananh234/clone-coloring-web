import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryDocumentSnapshot, DocumentData, Firestore } from "firebase/firestore";
import { useFirestoreOptional } from "./use-firestore";
import {
  firestoreGetAll,
  firestoreGetOne,
  firestoreCreate,
  firestoreUpdate,
  firestoreDelete,
} from "./firestore-helpers";
import type { FirestoreQueryOptions } from "./firestore-helpers";
import { notify, notifyError } from "../notifications";

// --- Types ---

type NotificationConfig<T> = {
  success?: (result: T) => { title: string; description: string };
  error?: (error: Error) => { title: string; description: string };
};

type FirestoreGetAllHookOptions = {
  entityName: string;
  collectionPath: string;
  orderByField?: string;
  orderByDirection?: "asc" | "desc";
  pageSize?: number;
  filters?: Record<string, unknown>;
  searchFields?: string[];
  searchTerm?: string;
  enabled?: boolean;
  /** Optional pre-resolved Firestore instance. When omitted, uses FirebaseProvider context. */
  firestore?: Firestore | null;
};

type FirestoreGetOneHookOptions = {
  entityName: string;
  collectionPath: string;
  docId: string;
  enabled?: boolean;
  /** Optional pre-resolved Firestore instance. When omitted, uses FirebaseProvider context. */
  firestore?: Firestore | null;
};

type FirestoreMutationHookOptions<T> = {
  entityName: string;
  collectionPath: string;
  method: "POST" | "PUT" | "DELETE";
  docId?: string;
  customId?: string;
  notifications?: NotificationConfig<T>;
  /** Optional pre-resolved Firestore instance. When omitted, uses FirebaseProvider context. */
  firestore?: Firestore | null;
};

// --- Hooks ---

/**
 * TanStack Query hook for paginated Firestore collection reads.
 * Manages cursor-based pagination state internally.
 */
export function useFirestoreGetAll<T>({
  entityName,
  collectionPath,
  orderByField,
  orderByDirection,
  pageSize = 20,
  filters,
  searchFields,
  searchTerm,
  enabled = true,
  firestore: firestoreProp,
}: FirestoreGetAllHookOptions) {
  const firestoreCtx = useFirestoreOptional();
  const firestore = firestoreProp ?? firestoreCtx;
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(QueryDocumentSnapshot<DocumentData> | null)[]>([null]);

  const currentCursor = cursors[page - 1] ?? null;

  const queryOptions: FirestoreQueryOptions = {
    collectionPath,
    orderByField,
    orderByDirection,
    pageSize,
    cursor: currentCursor,
    filters,
    searchFields,
    searchTerm,
  };

  const queryKey = [
    entityName,
    "firestore-list",
    collectionPath,
    page,
    pageSize,
    filters,
    searchTerm,
    orderByField,
    orderByDirection,
  ];

  const queryResult = useQuery({
    queryKey,
    queryFn: () => {
      if (!firestore) throw new Error("Firestore instance not available");
      return firestoreGetAll<T>(firestore, queryOptions);
    },
    enabled: enabled && !!firestore,
  });

  const goToNextPage = useCallback(() => {
    if (queryResult.data?.hasMore && queryResult.data.lastDoc) {
      setCursors((prev) => {
        const next = [...prev];
        next[page] = queryResult.data!.lastDoc;
        return next;
      });
      setPage((p) => p + 1);
    }
  }, [queryResult.data, page]);

  const goToPrevPage = useCallback(() => {
    if (page > 1) {
      setPage((p) => p - 1);
    }
  }, [page]);

  const goToFirstPage = useCallback(() => {
    setPage(1);
    setCursors([null]);
  }, []);

  const refresh = useCallback(() => {
    goToFirstPage();
    queryResult.refetch();
  }, [goToFirstPage, queryResult]);

  return {
    data: queryResult.data?.data ?? [],
    hasMore: queryResult.data?.hasMore ?? false,
    page,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refresh,
    goToNextPage,
    goToPrevPage,
    goToFirstPage,
  };
}

/**
 * TanStack Query hook for fetching a single Firestore document.
 */
export function useFirestoreGetOne<T>({
  entityName,
  collectionPath,
  docId,
  enabled = true,
  firestore: firestoreProp,
}: FirestoreGetOneHookOptions) {
  const firestoreCtx = useFirestoreOptional();
  const firestore = firestoreProp ?? firestoreCtx;

  const queryResult = useQuery({
    queryKey: [entityName, "firestore-detail", collectionPath, docId],
    queryFn: () => {
      if (!firestore) throw new Error("Firestore instance not available");
      return firestoreGetOne<T>(firestore, collectionPath, docId);
    },
    enabled: enabled && !!docId && !!firestore,
  });

  return {
    data: queryResult.data as T | undefined,
    isLoading: queryResult.isLoading,
    isError: queryResult.isError,
    error: queryResult.error,
    refresh: queryResult.refetch,
  };
}

/**
 * TanStack Mutation hook for Firestore create/update/delete.
 * Auto-invalidates entity queries on success.
 */
export function useFirestoreMutation<T>({
  entityName,
  collectionPath,
  method,
  docId,
  customId,
  notifications,
  firestore: firestoreProp,
}: FirestoreMutationHookOptions<T>) {
  const firestoreCtx = useFirestoreOptional();
  const firestore = firestoreProp ?? firestoreCtx;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data?: Record<string, unknown>) => {
      if (!firestore) throw new Error("Firestore instance not available");
      switch (method) {
        case "POST":
          return firestoreCreate<T>(firestore, collectionPath, data ?? {}, customId);
        case "PUT":
          if (!docId) throw new Error("docId is required for PUT");
          return firestoreUpdate<T>(firestore, collectionPath, docId, data ?? {});
        case "DELETE":
          if (!docId) throw new Error("docId is required for DELETE");
          await firestoreDelete(firestore, collectionPath, docId);
          return undefined as unknown as T;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [entityName] });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: [entityName] });
      if (notifications?.success && result) {
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
