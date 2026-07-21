const KEY = "dandii.recentSearches";
const MAX = 20;

export interface RecentSearch {
  q: string;
  at: number;
}

export function readRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentSearch[]) : [];
  } catch {
    return [];
  }
}

export function recordSearch(q: string) {
  const trimmed = q.trim();
  if (typeof window === "undefined" || trimmed.length < 2) return;
  const existing = readRecentSearches().filter(
    (r) => r.q.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next = [{ q: trimmed, at: Date.now() }, ...existing].slice(0, MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function clearRecentSearches() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
