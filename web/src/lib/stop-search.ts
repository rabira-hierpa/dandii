/**
 * Collapse feed stops that share a name into one search result.
 *
 * The DT4A feed fragments a place into many nodes (e.g. ~36 stops all named
 * "Megenagna"). Showing them all floods search, so we group by name (case-
 * insensitive), keep the first stop of each group as the representative, and
 * report how many were folded in. Input is expected pre-sorted by name so the
 * output stays alphabetical; the representative is the first-seen stop.
 */
export interface NamedStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export function groupStopsByName<T extends NamedStop>(
  rows: T[],
  limit: number,
): (T & { count: number })[] {
  const byName = new Map<string, { rep: T; count: number }>();
  for (const s of rows) {
    const key = s.name.toLowerCase();
    const group = byName.get(key);
    if (group) group.count += 1;
    else byName.set(key, { rep: s, count: 1 });
  }
  return [...byName.values()]
    .slice(0, limit)
    .map((g) => ({ ...g.rep, count: g.count }));
}
