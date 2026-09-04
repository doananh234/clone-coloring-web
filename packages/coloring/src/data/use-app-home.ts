"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { httpGet, httpPut, httpPost } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";

/** Firestore app/home shapes (kept in sync with server-core buildAppHomeDoc). */
export interface HomeNewArrival { id: string; title: string; coverUrl: string; price?: string; subtitle?: string; order?: number; backgroundColor?: string }
export interface HomeTrending { id: string; rank: number; title: string; subtitle: string; imageUrl: string; participantCount?: string }
export interface HomeCategory { id: string; name: string; displayName: string; description: string; iconUrl: string; isPublic: boolean; order: number }
export interface HomeFreePage { id: string; bookId: string; bookTitle: string; series: string; imageUrl: string; backgroundColor: string }
export interface AppHome {
  newArrivalBooks: HomeNewArrival[];
  trendingBooks: HomeTrending[];
  categories: HomeCategory[];
  freeColoringPages: HomeFreePage[];
}

const EMPTY: AppHome = { newArrivalBooks: [], trendingBooks: [], categories: [], freeColoringPages: [] };

/** Home-collection management: read + save the app/home doc, auto-config, publish. */
export function useAppHome() {
  const qc = useQueryClient();
  const base = `${COLORING_API_BASE}/app-home`;
  const query = useQuery({
    queryKey: ["coloring", "app-home"],
    queryFn: async () => {
      const d = await httpGet<Partial<AppHome>>(base);
      return {
        newArrivalBooks: d.newArrivalBooks ?? [],
        trendingBooks: d.trendingBooks ?? [],
        categories: d.categories ?? [],
        freeColoringPages: d.freeColoringPages ?? [],
      } satisfies AppHome;
    },
  });
  const inval = () => qc.invalidateQueries({ queryKey: ["coloring", "app-home"] });

  return {
    home: query.data ?? EMPTY,
    isLoading: query.isLoading,
    isError: query.isError,
    writeEnabled: COLORING_WRITE_ENABLED,
    /** Persist hand-edited lists (whole-doc overwrite of the local App store). */
    save: async (doc: AppHome) => {
      await httpPut(base, doc);
      inval();
    },
    /** "Auto config" — server rebuilds all lists heuristically from books. */
    autoConfig: async () => {
      const r = await httpPost<{ synced?: Record<string, number> }>(`${base}/sync`, {});
      inval();
      return r?.synced;
    },
    /** Push the current local app/home doc up to prod Firestore. */
    publish: async () =>
      httpPost<{ projectId?: string; pushed?: Record<string, number> }>(`${base}/sync-firebase`, {}),
  };
}
