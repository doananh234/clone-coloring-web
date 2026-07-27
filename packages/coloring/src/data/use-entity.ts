"use client";

import { useQuery } from "@tanstack/react-query";
import { httpGet } from "@vx/core-uikit/api";
import { COLORING_API_BASE } from "./config";
import { useEntityPatch } from "./local-entities";

export type EntityRecord = Record<string, unknown>;

export interface UseEntityResult {
  entity: EntityRecord | undefined;
  isLoading: boolean;
  isError: boolean;
}

/** Fetch a single entity record (GET {base}/{path}/{id}, raw object). Read-only. */
export function useEntity(path: string, id: string): UseEntityResult {
  const query = useQuery({
    queryKey: ["coloring", "entity-one", path, id],
    queryFn: () => httpGet<EntityRecord>(`${COLORING_API_BASE}/${path}/${encodeURIComponent(id)}`),
    enabled: Boolean(path && id),
  });
  const patch = useEntityPatch(path, id);
  const entity = query.data ? { ...query.data, ...patch } : query.data;
  return { entity, isLoading: query.isLoading, isError: query.isError };
}
