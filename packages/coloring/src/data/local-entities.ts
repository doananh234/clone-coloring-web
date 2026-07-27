"use client";

import { useSyncExternalStore } from "react";
import type { EntityRecord } from "./use-entity";

/**
 * SAFE local edit sandbox for entities (characters, locations, styles, brands).
 * Field edits are stored ONLY in localStorage as a per-(kind,id) patch and
 * merged over the real (read-only) record. Never PUTs; only ADDS an override.
 */
const KEY = "coloring:local-entity-overrides";
const EMPTY: Record<string, EntityRecord> = {};

let cache: Record<string, EntityRecord> | null = null;
const listeners = new Set<() => void>();

function keyOf(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function read(): Record<string, EntityRecord> {
  if (typeof window === "undefined") return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, EntityRecord>) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function commit(next: Record<string, EntityRecord>): void {
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

export function getEntityPatch(kind: string, id: string): EntityRecord | undefined {
  const p = read()[keyOf(kind, id)];
  return p && Object.keys(p).length ? p : undefined;
}

export function saveEntityPatch(kind: string, id: string, patch: EntityRecord): void {
  const all = read();
  const k = keyOf(kind, id);
  commit({ ...all, [k]: { ...all[k], ...patch } });
}

export function applyEntityPatch(kind: string, id: string, entity: EntityRecord): EntityRecord {
  const patch = read()[keyOf(kind, id)];
  return patch ? { ...entity, ...patch } : entity;
}

export function useEntityPatch(kind: string, id: string): EntityRecord | undefined {
  return useSyncExternalStore(
    subscribe,
    () => getEntityPatch(kind, id),
    () => undefined,
  );
}
