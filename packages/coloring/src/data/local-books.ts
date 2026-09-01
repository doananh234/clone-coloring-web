"use client";

import { useSyncExternalStore } from "react";
import type { BookDetail, BookSpecifications, BookEtsyListing } from "./types";

/**
 * SAFE local edit sandbox for books. Field edits are stored ONLY in
 * localStorage as a per-id patch and merged over the real (read-only) book.
 * Never PUTs to the backend; only ADDS an override layer — the real record is
 * never mutated or deleted.
 */
const KEY = "coloring:local-book-overrides";
const EMPTY: Record<string, BookPatch> = {};

/**
 * All editable book fields. Split at save time (see toBookPayload):
 *   - real Book columns → sent top-level to PUT
 *   - the rest → merged into Book.data (non-destructive) by the PUT route
 */
export interface BookPatch {
  // --- real Book columns ---
  title?: BookDetail["title"];
  subtitle?: BookDetail["subtitle"];
  description?: BookDetail["description"];
  price?: BookDetail["price"];
  originalPrice?: BookDetail["originalPrice"];
  discount?: BookDetail["discount"];
  category?: BookDetail["category"];
  categoryId?: BookDetail["categoryId"];
  badge?: BookDetail["badge"];
  backgroundColor?: BookDetail["backgroundColor"];
  tryoutPage?: BookDetail["tryoutPage"];
  coverUrl?: BookDetail["coverUrl"];
  pdfUrl?: BookDetail["pdfUrl"];
  thumbnailUrl?: BookDetail["thumbnailUrl"];
  squareThumbnailUrl?: BookDetail["squareThumbnailUrl"];
  niche?: BookDetail["niche"];
  isPublic?: boolean;
  // --- Book.data blob fields ---
  isPremium?: boolean;
  isConverted?: boolean;
  isRedesigned?: boolean;
  isEditionConverted?: boolean;
  tags?: string[];
  primaryColor?: string;
  secondaryColor?: string;
  themeStyle?: string;
  holiday?: string;
  occasion?: string;
  specifications?: BookSpecifications;
  etsyListing?: BookEtsyListing;
}

let cache: Record<string, BookPatch> | null = null;
const listeners = new Set<() => void>();

function read(): Record<string, BookPatch> {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, BookPatch>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function commit(next: Record<string, BookPatch>): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getBookPatch(id: string): BookPatch | undefined {
  const p = read()[id];
  return p && Object.keys(p).length ? p : undefined;
}

export function saveBookPatch(id: string, patch: BookPatch): void {
  const all = read();
  commit({ ...all, [id]: { ...all[id], ...patch } });
}

export function clearBookPatch(id: string): void {
  const all = read();
  if (!all[id]) return;
  const next = { ...all };
  delete next[id];
  commit(next);
}

/** Merge any local patch over a real book (or list row). */
export function applyBookPatch<T extends { id: string }>(book: T): T {
  const patch = read()[book.id];
  return patch ? { ...book, ...patch } : book;
}

/** React hook: the patch for one id (reactive), or undefined. */
export function useBookPatch(id: string): BookPatch | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getBookPatch(id),
    () => undefined,
  );
}
