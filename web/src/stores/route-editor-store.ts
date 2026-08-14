import { create } from "zustand";
import type { RouteEditorDetail, RouteEditorTab } from "@/types/console";

/**
 * Console route-editor UI state.
 *
 * Separate from the map store because it has a different lifetime: the map's
 * selection survives everything, while this resets whenever a different route
 * is opened. Keeping them apart means selecting a route doesn't re-render the
 * map layers, and editing a field doesn't either.
 */
interface RouteEditorState {
  activeTab: RouteEditorTab;
  setActiveTab: (tab: RouteEditorTab) => void;

  /** Which direction the Stops tab is showing. */
  directionId: number;
  setDirectionId: (directionId: number) => void;

  detail: RouteEditorDetail | null;
  detailLoading: boolean;
  setDetail: (detail: RouteEditorDetail | null) => void;
  setDetailLoading: (loading: boolean) => void;

  /**
   * A stop the map should fly to. The Stops tab sets it on click; the map
   * watches it and moves. Routed through the store rather than a callback so
   * the tab never holds a map handle — it has no business owning one.
   *
   * `nonce` makes clicking the same stop twice fly again: without it the value
   * is unchanged and the effect never re-runs.
   */
  focusedStop: { id: string; lat: number; lon: number; nonce: number } | null;
  focusStop: (stop: { id: string; lat: number; lon: number }) => void;

  /** Banner under the tab bar. Cleared on tab change and on route change. */
  feedback: { kind: "ok" | "error"; message: string } | null;
  setFeedback: (feedback: RouteEditorState["feedback"]) => void;

  /** Reset everything route-scoped. Called when the selected route changes. */
  resetForRoute: () => void;
}

export const useRouteEditorStore = create<RouteEditorState>((set) => ({
  activeTab: "details",
  setActiveTab: (activeTab) => set({ activeTab, feedback: null }),

  directionId: 0,
  setDirectionId: (directionId) => set({ directionId }),

  detail: null,
  detailLoading: false,
  setDetail: (detail) => set({ detail }),
  setDetailLoading: (detailLoading) => set({ detailLoading }),

  focusedStop: null,
  focusStop: (stop) =>
    set((state) => ({
      focusedStop: { ...stop, nonce: (state.focusedStop?.nonce ?? 0) + 1 },
    })),

  feedback: null,
  setFeedback: (feedback) => set({ feedback }),

  resetForRoute: () =>
    set({
      activeTab: "details",
      directionId: 0,
      detail: null,
      feedback: null,
      focusedStop: null,
    }),
}));
