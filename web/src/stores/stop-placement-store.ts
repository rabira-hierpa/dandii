import { create } from "zustand";
import { ADDIS_BOUNDS } from "@/actions/stop-edit-schema";

/**
 * "Pick this stop's position on the map" state.
 *
 * A store rather than component state because the two halves live in different
 * subtrees: the Stops tab owns the create form, the console map owns the click,
 * and neither is an ancestor of the other. The alternative — lifting a
 * `useState` into the console page and threading a setter through both — is the
 * prop-drilling this project keeps stores to avoid.
 *
 * Separate from `shape-draw-store` because the two are mutually exclusive modes
 * with different lifetimes, and a click has to resolve to exactly one of them.
 */

/** A point the operator picked, before it becomes a stop. */
export interface PickedPoint {
  lat: number;
  lon: number;
}

/** True when the point is inside the bounds `createStop` will accept. */
export function isInAddis(point: PickedPoint): boolean {
  return (
    point.lat >= ADDIS_BOUNDS.minLat &&
    point.lat <= ADDIS_BOUNDS.maxLat &&
    point.lon >= ADDIS_BOUNDS.minLon &&
    point.lon <= ADDIS_BOUNDS.maxLon
  );
}

interface StopPlacementState {
  /**
   * The coordinate fields themselves, as text.
   *
   * They live here rather than in the form because a map click has to fill
   * them, and mirroring a store value into `useState` with an effect is both
   * the cascading-render smell the linter flags and the sync-effect this
   * project's rules forbid. The store owns them; the inputs are controlled by
   * it and stay freely editable, so typing a surveyed coordinate still works.
   */
  latText: string;
  lonText: string;
  setLatText: (value: string) => void;
  setLonText: (value: string) => void;

  /** True while the operator is choosing a position on the map. */
  placing: boolean;
  /**
   * The last point picked, kept after `placing` goes false so the form can
   * show it and the map can keep the provisional marker up while the operator
   * types a name.
   */
  picked: PickedPoint | null;
  /**
   * Set when a click landed outside Addis. Held here rather than thrown away
   * so the form can say why nothing happened — a click that silently does
   * nothing reads as a broken map.
   */
  outOfBounds: boolean;

  startPlacing: () => void;
  cancelPlacing: () => void;
  /** Record a click. Out-of-bounds points are refused, and placing stays on. */
  pick: (point: PickedPoint) => void;
  /** Drop the picked point and any error, e.g. after the stop is created. */
  reset: () => void;
}

export const useStopPlacementStore = create<StopPlacementState>((set) => ({
  placing: false,
  picked: null,
  outOfBounds: false,
  latText: "",
  lonText: "",

  setLatText: (value) => set({ latText: value }),
  setLonText: (value) => set({ lonText: value }),

  startPlacing: () => set({ placing: true, outOfBounds: false }),
  cancelPlacing: () => set({ placing: false, outOfBounds: false }),

  pick: (point) => {
    if (!isInAddis(point)) {
      // Stay in placing mode: the operator meant to place a stop, and the
      // useful next event is another click, not a mode exit.
      set({ outOfBounds: true });
      return;
    }
    set({
      placing: false,
      picked: point,
      outOfBounds: false,
      // Six decimals is about 11 cm — past the precision of a click, and past
      // anything a bus stop position needs.
      latText: point.lat.toFixed(6),
      lonText: point.lon.toFixed(6),
    });
  },

  reset: () =>
    set({
      placing: false,
      picked: null,
      outOfBounds: false,
      latText: "",
      lonText: "",
    }),
}));
