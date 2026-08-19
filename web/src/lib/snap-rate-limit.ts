/**
 * Per-user throttle for the shape-snapping endpoint.
 *
 * In memory rather than a table, unlike the fare-proposal limiter: a snap is a
 * preview, not a record, so there is nothing worth persisting and nothing worth
 * auditing. Resetting on deploy is fine — this exists to stop one operator's
 * drawing session from starving the planner every rider shares, not to enforce
 * a quota.
 *
 * The budget is a rolling window rather than a token bucket because drawing is
 * bursty by nature: placing eight waypoints in four seconds is normal use, and a
 * bucket that refills smoothly would punish it.
 */

/** Requests one user may make inside the window. */
const LIMIT = 120;
const WINDOW_MS = 60_000;

const hits = new Map<string, number[]>();

/**
 * Record a request and report whether it is allowed. `retryAfterSeconds` is set
 * only when it isn't, so the caller can send a truthful `Retry-After`.
 */
export function allowSnap(userId: string, now = Date.now()): {
  allowed: boolean;
  retryAfterSeconds?: number;
} {
  const cutoff = now - WINDOW_MS;
  const recent = (hits.get(userId) ?? []).filter((t) => t > cutoff);

  if (recent.length >= LIMIT) {
    hits.set(userId, recent);
    const oldest = recent[0];
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  recent.push(now);
  hits.set(userId, recent);

  // Drop users who have gone quiet, so the map can't grow without bound in a
  // long-lived server process.
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (times.every((t) => t <= cutoff)) hits.delete(key);
    }
  }

  return { allowed: true };
}

/** Test seam — the window is time-based, so suites need a way to start clean. */
export function resetSnapRateLimit(): void {
  hits.clear();
}
