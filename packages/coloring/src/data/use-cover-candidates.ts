"use client";

import { useQueryClient } from "@tanstack/react-query";
import { httpPost, httpPatch, httpDel } from "@vx/core-uikit/api";
import { COLORING_API_BASE, COLORING_WRITE_ENABLED } from "./config";
import { selectCandidate, deleteCandidate, type CoverCandidate, type CoverState } from "./cover-candidates";
import type { BookDetail } from "./types";

const LOCAL_ONLY = "Chỉ chạy ở chế độ ghi thật (staging).";

/** Project a book's cover state (coverUrl column + book.data JSON) into CoverState. */
function toCoverState(book: BookDetail): CoverState {
  const d = (book.data ?? {}) as Record<string, unknown>;
  return {
    coverUrl: book.coverUrl ?? undefined,
    coverCandidates: d.coverCandidates as CoverCandidate[] | undefined,
    selectedCoverCandidateId: d.selectedCoverCandidateId as string | undefined,
  };
}

/** Fold a mutated CoverState back onto the book (mirrors the server's writeState). */
function fromCoverState(book: BookDetail, next: CoverState): BookDetail {
  return {
    ...book,
    coverUrl: next.coverUrl ?? book.coverUrl,
    data: {
      ...(book.data ?? {}),
      coverCandidates: next.coverCandidates,
      selectedCoverCandidateId: next.selectedCoverCandidateId,
    },
  };
}

/**
 * Optimistic cover-candidate SELECT — reuses the same pure `selectCandidate` the
 * server route uses, so the cache mirrors the server exactly. Returns the patched
 * book, or `null` when the candidate isn't in cache (→ fall back to a refetch).
 */
export function applyCoverSelect(book: BookDetail | undefined, candidateId: string): BookDetail | null {
  if (!book) return null;
  try {
    return fromCoverState(book, selectCandidate(toCoverState(book), candidateId));
  } catch {
    return null;
  }
}

/**
 * Optimistic cover-candidate REMOVE — reuses the pure `deleteCandidate`, which
 * refuses to remove the currently-selected candidate. Returns the patched book,
 * or `null` when removal isn't safe (selected / not found → fall back to refetch).
 */
export function applyCoverRemove(book: BookDetail | undefined, candidateId: string): BookDetail | null {
  if (!book) return null;
  try {
    return fromCoverState(book, deleteCandidate(toCoverState(book), candidateId));
  } catch {
    return null;
  }
}

/** D4c: non-destructive cover-candidate actions (push / select / delete). */
export function useCoverCandidates(bookId: string) {
  const qc = useQueryClient();
  const key = ["coloring", "book", bookId];
  const inval = () => qc.invalidateQueries({ queryKey: key });
  const base = `${COLORING_API_BASE}/books/${encodeURIComponent(bookId)}/cover-candidates`;
  const guard = () => { if (!COLORING_WRITE_ENABLED) throw new Error(LOCAL_ONLY); };

  /** Shared optimistic runner: patch cache, call the API, roll back / invalidate. */
  const optimistic = async (
    patch: (book: BookDetail | undefined) => BookDetail | null,
    call: () => Promise<unknown>,
  ) => {
    const prev = qc.getQueryData<BookDetail>(key);
    const patched = patch(prev);
    if (patched) {
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData(key, patched);
    }
    try {
      await call();
      if (!patched) inval(); // couldn't patch optimistically → refetch to reconcile
    } catch (e) {
      if (patched && prev) qc.setQueryData(key, prev); // rollback
      else inval();
      throw e;
    }
  };

  return {
    enabled: COLORING_WRITE_ENABLED,
    /** Push a page's colored image to Cover: adds a candidate and auto-selects it.
     *  Keeps a refetch — the server mints the new candidate id we can't predict. */
    push: async (pageId: string, coloredUrl: string) => {
      guard();
      await httpPost(base, { url: coloredUrl, fromPageId: pageId });
      inval();
    },
    select: async (candidateId: string) => {
      guard();
      await optimistic(
        (book) => applyCoverSelect(book, candidateId),
        () => httpPatch(base, { candidateId }),
      );
    },
    remove: async (candidateId: string) => {
      guard();
      await optimistic(
        (book) => applyCoverRemove(book, candidateId),
        () => httpDel(`${base}/${encodeURIComponent(candidateId)}`),
      );
    },
  };
}
