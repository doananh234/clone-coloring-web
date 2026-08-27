"use client";

import { useSyncExternalStore } from "react";
import type { CloneJobRow } from "./types";

/**
 * SAFE local write sandbox. Clone jobs created in the UI are stored ONLY in
 * localStorage — never POSTed to the real backend. They are merged on top of
 * the real (read-only) list for testing. Nothing here reads, mutates, or
 * deletes production data; it only ADDS local draft records.
 */
const KEY = "coloring:local-jobs";
const EMPTY: LocalJob[] = [];

export type LocalJob = CloneJobRow & { __local: true };

let cache: LocalJob[] | null = null;
const listeners = new Set<() => void>();

function read(): LocalJob[] {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as LocalJob[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function commit(next: LocalJob[]): void {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full / unavailable — keep in-memory */
  }
  listeners.forEach((l) => l());
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getLocalJobs(): LocalJob[] {
  return read();
}

export function getLocalJob(id: string): LocalJob | undefined {
  return read().find((j) => j.id === id);
}

export interface NewLocalJobInput {
  name: string;
  sourceFileName?: string;
  brand?: string;
  mode?: string;
  totalPages?: number;
}

export function addLocalJob(input: NewLocalJobInput): LocalJob {
  const now = new Date().toISOString();
  const job: LocalJob = {
    __local: true,
    id: `local-${crypto.randomUUID()}`,
    name: input.name.trim() || "Job nháp",
    status: "queued",
    totalPages: input.totalPages ?? 0,
    analyzedPages: 0,
    // A local draft is never picked up by the worker, so no step is ever running.
    runningStep: null,
    runningSince: null,
    runningBudgetSec: null,
    bookId: null,
    sourceBookId: input.sourceFileName ?? null,
    currentStep: input.mode ? `Chờ xử lý · ${input.mode}` : "Chờ xử lý",
    failedStep: null,
    error: null,
    retryHistory: [],
    thumbnailUrl: null,
    brand: input.brand?.trim() || null,
    createdAt: now,
    updatedAt: now,
  };
  commit([job, ...read()]);
  return job;
}

/** Remove a LOCAL draft only (never a real record — real ids are not in the store). */
export function removeLocalJob(id: string): void {
  commit(read().filter((j) => j.id !== id));
}

/** React hook: current local jobs, re-rendering on change. */
export function useLocalJobs(): LocalJob[] {
  return useSyncExternalStore(subscribe, getLocalJobs, () => EMPTY);
}
