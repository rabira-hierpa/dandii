import { create } from "zustand";
import { MAX_WAYPOINTS } from "@/actions/shape-edit-schema";
import type { ShapeWaypoint } from "@/types/console";

/**
 * Console shape-drawing state.
 *
 * Its own store rather than a slice of `route-editor-store` because it has a
 * different lifetime and a different set of readers: a draw session starts and
 * ends inside one route, and the map, the Shapes tab, the context menu and the
 * toolbar all read it. Keeping it separate means placing a waypoint doesn't
 * re-render the Details form, and typing in the Details form doesn't re-render
 * the map layers.
 */

/** One drawn span between consecutive waypoints, as the preview knows it. */
export interface DraftSegment {
  coordinates: [number, number][];
  /** OTP couldn't route it; drawn dashed so the gap is visible, not laundered. */
  straightLine: boolean;
}

export interface ShapeContextMenuState {
  /** Screen position, in map-container pixels. */
  x: number;
  y: number;
  /**
   * Container size at the moment of the click. Captured here rather than
   * measured during render so the menu can flip away from an edge without
   * reading a ref while React is rendering.
   */
  containerWidth: number;
  containerHeight: number;
  routeId: string;
  directionId: number;
}

interface ShapeDrawState {
  /** The route/direction being drawn, or null when not in draw mode. */
  target: { routeId: string; directionId: number; label: string } | null;
  waypoints: ShapeWaypoint[];
  /** Snapped spans, index-aligned with the gaps between waypoints. */
  segments: DraftSegment[];
  /** A snap request is outstanding. */
  snapping: boolean;
  /** Set when snapping failed outright, rather than falling back to a line. */
  snapError: string | null;
  saving: boolean;
  contextMenu: ShapeContextMenuState | null;

  begin: (target: {
    routeId: string;
    directionId: number;
    label: string;
    waypoints?: ShapeWaypoint[];
  }) => void;
  /** Returns false when the cap is already reached, so the caller can say so. */
  addWaypoint: (waypoint: ShapeWaypoint) => boolean;
  removeWaypoint: (index: number) => void;
  undo: () => void;
  setSegments: (segments: DraftSegment[]) => void;
  setSnapping: (snapping: boolean) => void;
  setSnapError: (error: string | null) => void;
  setSaving: (saving: boolean) => void;
  openContextMenu: (menu: ShapeContextMenuState) => void;
  closeContextMenu: () => void;
  /**
   * Drop the drawing but leave any open menu alone.
   *
   * Selecting a route has to abandon a drawing on the previous one, but
   * right-clicking an unselected route BOTH selects it and opens the menu — so a
   * reset that also closed the menu would erase it in the same tick it appeared.
   */
  resetDraft: () => void;
  /** Drop the drawing and close the menu. Cancel, save, and leaving the editor. */
  reset: () => void;
}

/** A function so each reset gets its own arrays rather than sharing one. */
function emptyDraft(): Pick<
  ShapeDrawState,
  "target" | "waypoints" | "segments" | "snapping" | "snapError" | "saving"
> {
  return {
    target: null,
    waypoints: [],
    segments: [],
    snapping: false,
    snapError: null,
    saving: false,
  };
}

export const useShapeDrawStore = create<ShapeDrawState>((set, get) => ({
  ...emptyDraft(),
  contextMenu: null,

  begin: ({ routeId, directionId, label, waypoints }) =>
    set({
      ...emptyDraft(),
      // Reopening an edited direction starts from the operator's own points,
      // which is the whole reason S1 stores waypoints beside the geometry.
      waypoints: waypoints ?? [],
      target: { routeId, directionId, label },
      contextMenu: null,
    }),

  addWaypoint: (waypoint) => {
    if (get().waypoints.length >= MAX_WAYPOINTS) return false;
    set((s) => ({ waypoints: [...s.waypoints, waypoint], snapError: null }));
    return true;
  },

  removeWaypoint: (index) =>
    set((s) => ({
      waypoints: s.waypoints.filter((_, i) => i !== index),
      snapError: null,
    })),

  undo: () =>
    set((s) => ({ waypoints: s.waypoints.slice(0, -1), snapError: null })),

  setSegments: (segments) => set({ segments }),
  setSnapping: (snapping) => set({ snapping }),
  setSnapError: (snapError) => set({ snapError }),
  setSaving: (saving) => set({ saving }),

  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),

  resetDraft: () => set(emptyDraft()),
  reset: () => set({ ...emptyDraft(), contextMenu: null }),
}));

/** True while a drawing holds work the operator would not want to lose. */
export function isDirty(state: Pick<ShapeDrawState, "target" | "waypoints">) {
  return state.target !== null && state.waypoints.length > 0;
}

/** How many drawn spans fell back to a straight line. */
export function unsnappedCount(segments: DraftSegment[]): number {
  return segments.filter((s) => s.straightLine).length;
}
