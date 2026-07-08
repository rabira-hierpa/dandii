import { create } from "zustand";
import type { OperatorCode } from "@/lib/operators";

export type SheetSnap = "collapsed" | "half" | "full";

/** Shared public-map UI state. */
interface MapState {
  selectedRouteId: string | null;
  setSelectedRouteId: (routeId: string | null) => void;

  /** Transit layers hidden by the user (all visible by default). */
  hiddenOperators: OperatorCode[];
  toggleOperator: (code: OperatorCode) => void;

  layersOpen: boolean;
  setLayersOpen: (open: boolean) => void;

  sheetSnap: SheetSnap;
  setSheetSnap: (snap: SheetSnap) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedRouteId: null,
  setSelectedRouteId: (routeId) => set({ selectedRouteId: routeId }),

  hiddenOperators: [],
  toggleOperator: (code) =>
    set((state) => ({
      hiddenOperators: state.hiddenOperators.includes(code)
        ? state.hiddenOperators.filter((c) => c !== code)
        : [...state.hiddenOperators, code],
    })),

  layersOpen: false,
  setLayersOpen: (open) => set({ layersOpen: open }),

  sheetSnap: "half",
  setSheetSnap: (snap) => set({ sheetSnap: snap }),
}));
