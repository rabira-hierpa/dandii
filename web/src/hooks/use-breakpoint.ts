"use client";

import { useSyncExternalStore } from "react";

const screens = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
};

/**
 * Checks whether a particular Tailwind CSS viewport size applies.
 */
export const useBreakpoint = (size: "sm" | "md" | "lg" | "xl" | "2xl") => {
  return useSyncExternalStore(
    (callback) => {
      const breakpoint = window.matchMedia(`(min-width: ${screens[size]})`);
      breakpoint.addEventListener("change", callback);
      return () => breakpoint.removeEventListener("change", callback);
    },
    () => window.matchMedia(`(min-width: ${screens[size]})`).matches,
    () => true,
  );
};
