"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribe to a CSS media query.
 *
 * `useSyncExternalStore` rather than state-plus-effect: `matchMedia` is exactly
 * the external store it exists for, and it gives the server snapshot (false) a
 * first-class home instead of a mismatched first paint corrected by a cascading
 * render. Callers gating an action on width should therefore treat the first
 * frame as "not known yet" and disable rather than enable.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(
    () => window.matchMedia(query).matches,
    [query],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
