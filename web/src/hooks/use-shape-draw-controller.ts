"use client";

import { useCallback } from "react";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import { resetRouteShape, saveRouteShape } from "@/actions/shape-edit";
import { ADDIS_BOUNDS, MAX_WAYPOINTS } from "@/actions/shape-edit-schema";
import { SHAPE_WAYPOINT_LAYER_ID } from "@/components/console/shape-draw-layer";
import { directionLabel } from "@/components/console/route-shapes-tab";
import { useRouteEditorStore } from "@/stores/route-editor-store";
import {
  isDirty,
  unsnappedCount,
  useShapeDrawStore,
} from "@/stores/shape-draw-store";
import type { RouteEditorDetail } from "@/types/console";

/**
 * Every decision draw mode makes about a map event, kept out of the map
 * component.
 *
 * `network-map.tsx` was already the most-edited file in the console and sat over
 * the complexity limit before this feature existed; folding six more handlers
 * into it would have made the map component a place nobody wants to open. The
 * map keeps the rendering and the mode branch; this owns what the modes mean.
 */
interface ShapeDrawController {
  /** True while a drawing is open. */
  drawing: boolean;
  placeWaypoint: (event: MapLayerMouseEvent) => void;
  /**
   * The whole right-click behaviour: remove a point while drawing, otherwise
   * open the shape menu for the line under the cursor.
   */
  onContextMenu: (event: MapLayerMouseEvent) => void;
  menuDirectionLabel: string;
  menuCanReset: boolean;
  onEditShapeFromMenu: () => void;
  onResetShapeFromMenu: () => void;
  onSaveShape: () => void;
  onCancelShape: () => void;
}

export function useShapeDrawController(
  detail: RouteEditorDetail | null,
  onSaved: () => void,
  /** Resolves the route under the cursor, honouring hidden agency layers. */
  routeUnderCursor: (event: MapLayerMouseEvent) => {
    routeId: string;
    directionId: number;
  } | null,
  selectRoute: (routeId: string) => void,
): ShapeDrawController {
  const setFeedback = useRouteEditorStore((s) => s.setFeedback);
  const setActiveTab = useRouteEditorStore((s) => s.setActiveTab);

  const target = useShapeDrawStore((s) => s.target);
  const waypoints = useShapeDrawStore((s) => s.waypoints);
  const segments = useShapeDrawStore((s) => s.segments);
  const contextMenu = useShapeDrawStore((s) => s.contextMenu);
  const openContextMenu = useShapeDrawStore((s) => s.openContextMenu);
  const addWaypoint = useShapeDrawStore((s) => s.addWaypoint);
  const removeWaypoint = useShapeDrawStore((s) => s.removeWaypoint);
  const begin = useShapeDrawStore((s) => s.begin);
  const closeContextMenu = useShapeDrawStore((s) => s.closeContextMenu);
  const setSaving = useShapeDrawStore((s) => s.setSaving);
  const reset = useShapeDrawStore((s) => s.reset);

  const menuDirection = contextMenu
    ? detail?.directions.find((d) => d.directionId === contextMenu.directionId)
    : undefined;
  // The detail may still be loading right after a right-click selected a new
  // route, so the label falls back to the side rather than showing nothing.
  const menuDirectionLabel = menuDirection
    ? directionLabel(menuDirection)
    : contextMenu?.directionId === 1
      ? "Inbound"
      : "Outbound";

  /**
   * Reject locally what the server would reject anyway. A point outside the
   * city or one past the cap costs a round trip and comes back as a raw
   * validation message — a worse answer than saying so here.
   */
  const placeWaypoint = useCallback(
    (event: MapLayerMouseEvent) => {
      const { lat, lng } = event.lngLat;
      const outside =
        lat < ADDIS_BOUNDS.minLat ||
        lat > ADDIS_BOUNDS.maxLat ||
        lng < ADDIS_BOUNDS.minLon ||
        lng > ADDIS_BOUNDS.maxLon;
      if (outside) {
        setFeedback({
          kind: "error",
          message: "That point is outside Addis Ababa",
        });
        return;
      }
      if (!addWaypoint({ lat, lon: lng })) {
        setFeedback({
          kind: "error",
          message: `${MAX_WAYPOINTS} waypoints is the limit`,
        });
      }
    },
    [addWaypoint, setFeedback],
  );

  const onContextMenu = useCallback(
    (event: MapLayerMouseEvent) => {
      event.preventDefault();

      // While drawing, right-click drops the point under the cursor and the
      // snapper rejoins its neighbours on the next pass.
      if (target) {
        const hit = event.features?.find(
          (f) => f.layer?.id === SHAPE_WAYPOINT_LAYER_ID,
        );
        const index = hit?.properties?.index;
        if (typeof index === "number") removeWaypoint(index);
        return;
      }

      const hit = routeUnderCursor(event);
      if (!hit) {
        closeContextMenu();
        return;
      }
      selectRoute(hit.routeId);
      // Container size is captured here, not read during render, so the menu
      // can flip away from an edge without touching layout mid-render.
      const container = event.target.getContainer();
      openContextMenu({
        x: event.point.x,
        y: event.point.y,
        containerWidth: container.clientWidth,
        containerHeight: container.clientHeight,
        routeId: hit.routeId,
        directionId: hit.directionId,
      });
    },
    [
      target,
      removeWaypoint,
      routeUnderCursor,
      selectRoute,
      closeContextMenu,
      openContextMenu,
    ],
  );

  const onEditShapeFromMenu = useCallback(() => {
    if (!contextMenu) return;
    closeContextMenu();
    setActiveTab("shapes");
    begin({
      routeId: contextMenu.routeId,
      directionId: contextMenu.directionId,
      label: menuDirectionLabel,
      waypoints: menuDirection?.shapeOverride?.waypoints,
    });
  }, [
    contextMenu,
    closeContextMenu,
    setActiveTab,
    begin,
    menuDirectionLabel,
    menuDirection,
  ]);

  const onResetShapeFromMenu = useCallback(() => {
    if (!contextMenu) return;
    const { routeId, directionId } = contextMenu;
    const label = menuDirectionLabel;
    closeContextMenu();
    if (
      !window.confirm(
        `Reset ${label} to the feed's own shape? The drawn line will be discarded.`,
      )
    ) {
      return;
    }
    void resetRouteShape({ routeId, directionId })
      .then((result) => {
        if (result.ok) {
          setFeedback({ kind: "ok", message: `${label} reset to the feed shape` });
          onSaved();
        } else {
          setFeedback({ kind: "error", message: result.error });
        }
      })
      .catch(() =>
        setFeedback({ kind: "error", message: "Couldn't reset the shape" }),
      );
  }, [contextMenu, menuDirectionLabel, closeContextMenu, setFeedback, onSaved]);

  /**
   * Commit the drawing. The server re-snaps from the waypoints rather than
   * trusting the preview geometry, so what lands is what the road network says,
   * not what the browser drew.
   */
  const onSaveShape = useCallback(() => {
    if (!target || waypoints.length < 2) return;

    const unsnapped = unsnappedCount(segments);
    const plural = unsnapped === 1 ? "" : "s";
    if (
      unsnapped > 0 &&
      !window.confirm(
        `${unsnapped} segment${plural} couldn't be snapped to a road and will be saved as straight lines. Save anyway?`,
      )
    ) {
      return;
    }

    setSaving(true);
    void saveRouteShape({
      routeId: target.routeId,
      directionId: target.directionId,
      waypoints,
    })
      .then((result) => {
        if (!result.ok) {
          setFeedback({ kind: "error", message: result.error });
          return;
        }
        const left = result.data.unsnappedCount;
        setFeedback({
          kind: "ok",
          message: left
            ? `Shape saved — ${left} segment${left === 1 ? "" : "s"} left as straight lines`
            : "Shape saved",
        });
        reset();
        // The geometry lives in client state from a fetch, so nothing repaints
        // the new line until we go and get it.
        onSaved();
      })
      .catch(() =>
        setFeedback({ kind: "error", message: "Couldn't save the shape" }),
      )
      .finally(() => setSaving(false));
  }, [target, waypoints, segments, setSaving, setFeedback, reset, onSaved]);

  const onCancelShape = useCallback(() => {
    if (isDirty({ target, waypoints }) && !window.confirm("Discard this drawing?")) {
      return;
    }
    reset();
  }, [target, waypoints, reset]);

  return {
    drawing: target !== null,
    placeWaypoint,
    onContextMenu,
    menuDirectionLabel,
    menuCanReset: Boolean(menuDirection?.shapeOverride?.canReset),
    onEditShapeFromMenu,
    onResetShapeFromMenu,
    onSaveShape,
    onCancelShape,
  };
}
