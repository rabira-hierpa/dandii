import { useSyncExternalStore } from "react";

const KEY = "dandii.recentSearches";
const MAX = 20;

export interface RecentSearch {
  q: string;
  at: number;
}

/** Stable empty reference for the server snapshot (SSR has no localStorage). */
const EMPTY: RecentSearch[] = [];

// Cached parse so getSnapshot returns a referentially-stable array while the
// underlying localStorage string is unchanged — required by useSyncExternalStore.
let cache: RecentSearch[] = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function readRaw(): RecentSearch[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw !== cacheRaw) {
      cacheRaw = raw;
      cache = raw ? (JSON.parse(raw) as RecentSearch[]) : EMPTY;
    }
    return cache;
  } catch {
    return EMPTY;
  }
}

function emit() {
  for (const l of listeners) l();
}

export function readRecentSearches(): RecentSearch[] {
  return readRaw();
}

export function recordSearch(q: string) {
  const trimmed = q.trim();
  if (typeof window === "undefined" || trimmed.length < 2) return;
  const existing = readRaw().filter(
    (r) => r.q.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [{ q: trimmed, at: Date.now() }, ...existing].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  emit();
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Cross-tab writes still update this tab (same-tab writes go through emit()).
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Reactive recent-searches list — no effect, no hydration mismatch. */
export function useRecentSearches(): RecentSearch[] {
  return useSyncExternalStore(subscribe, readRaw, () => EMPTY);
}
