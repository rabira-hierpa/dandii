"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  useShapeDrawStore,
  type DraftSegment,
} from "@/stores/shape-draw-store";
import type { ShapeWaypoint } from "@/types/console";

/**
 * Keeps the drawn preview in step with the waypoint list.
 *
 * Two things this does that a naive implementation does not.
 *
 * **It snaps one segment at a time.** `/api/console/snap` will happily snap a
 * whole list, but asking it to on every click means the twelfth waypoint costs
 * eleven OTP round trips to learn one new span — O(n^2) across a drawing
 * session. Segments are cached by their endpoints instead, so each click costs
 * exactly one request and removing a waypoint costs one for the rejoin.
 *
 * **It drops stale answers.** Clicks arrive faster than OTP replies, so without
 * a sequence guard a slow response for four waypoints can land after a fast one
 * for six and paint a line the operator has already moved past.
 */

const SEGMENT_KEY = (a: ShapeWaypoint, b: ShapeWaypoint) =>
  `${a.lat},${a.lon}|${b.lat},${b.lon}`;

interface SnapResponse {
  segments?: DraftSegment[];
}

/** A straight span, for when the request itself fails rather than the routing. */
function straightSpan(a: ShapeWaypoint, b: ShapeWaypoint): DraftSegment {
  return {
    coordinates: [
      [a.lon, a.lat],
      [b.lon, b.lat],
    ],
    straightLine: true,
  };
}

export function useShapeDraw() {
  const waypoints = useShapeDrawStore((s) => s.waypoints);
  const target = useShapeDrawStore((s) => s.target);
  const setSegments = useShapeDrawStore((s) => s.setSegments);
  const setSnapping = useShapeDrawStore((s) => s.setSnapping);
  const setSnapError = useShapeDrawStore((s) => s.setSnapError);

  const cache = useRef(new Map<string, DraftSegment>());
  const sequence = useRef(0);
  const abort = useRef<AbortController | null>(null);

  // A fresh drawing must not inherit the previous one's spans.
  const targetKey = target ? `${target.routeId}:${target.directionId}` : null;
  useEffect(() => {
    cache.current.clear();
  }, [targetKey]);

  const snapMissing = useCallback(async () => {
    if (waypoints.length < 2) {
      setSegments([]);
      return;
    }

    const pairs = waypoints.slice(0, -1).map((from, i) => ({
      from,
      to: waypoints[i + 1],
      key: SEGMENT_KEY(from, waypoints[i + 1]),
    }));
    const missing = pairs.filter((p) => !cache.current.has(p.key));

    // Everything already known: paint immediately, no request at all. This is
    // the path an undo or a waypoint removal usually takes.
    if (missing.length === 0) {
      setSegments(pairs.map((p) => cache.current.get(p.key) as DraftSegment));
      return;
    }

    const ticket = ++sequence.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSnapping(true);

    try {
      const results = await Promise.all(
        missing.map(async (pair) => {
          const res = await fetch("/api/console/snap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({ waypoints: [pair.from, pair.to] }),
          });
          if (!res.ok) {
            const detail = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            throw new Error(detail?.error ?? "Couldn't reach the road network");
          }
          const data = (await res.json()) as SnapResponse;
          return {
            key: pair.key,
            segment: data.segments?.[0] ?? straightSpan(pair.from, pair.to),
          };
        }),
      );

      // A newer click already went out; its answer is the current truth.
      if (ticket !== sequence.current) return;

      for (const { key, segment } of results) cache.current.set(key, segment);
      setSegments(pairs.map((p) => cache.current.get(p.key) as DraftSegment));
      setSnapError(null);
    } catch (err) {
      if (controller.signal.aborted || ticket !== sequence.current) return;
      // Keep the last good preview rather than blanking the line, and fall the
      // unknown spans back to straight so the operator can still finish and save.
      for (const pair of missing) {
        cache.current.set(pair.key, straightSpan(pair.from, pair.to));
      }
      setSegments(pairs.map((p) => cache.current.get(p.key) as DraftSegment));
      setSnapError(
        err instanceof Error
          ? err.message
          : "Couldn't reach the road network — showing straight lines",
      );
    } finally {
      if (ticket === sequence.current) setSnapping(false);
    }
  }, [waypoints, setSegments, setSnapping, setSnapError]);

  useEffect(() => {
    void snapMissing();
  }, [snapMissing]);

  // Abandoning draw mode must not leave a request in flight that resolves into
  // a store nobody is showing any more.
  useEffect(() => {
    return () => {
      abort.current?.abort();
    };
  }, []);
}
