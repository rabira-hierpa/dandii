import { beforeEach, describe, expect, it } from "vitest";
import { MAX_WAYPOINTS } from "@/actions/shape-edit-schema";
import {
  isDirty,
  unsnappedCount,
  useShapeDrawStore,
  type DraftSegment,
} from "./shape-draw-store";

const store = () => useShapeDrawStore.getState();
const point = (n: number) => ({ lat: 9.01 + n * 0.001, lon: 38.76 + n * 0.001 });

const TARGET = {
  routeId: "route-1",
  directionId: 0,
  label: "Outbound → Megenagna",
};

beforeEach(() => {
  store().reset();
});

describe("begin", () => {
  it("starts an empty drawing for a direction with no shape", () => {
    store().begin(TARGET);

    expect(store().target).toEqual(TARGET);
    expect(store().waypoints).toEqual([]);
  });

  it("reopens an edited direction from its own waypoints", () => {
    // The reason S1 stores waypoints beside the geometry: reopening has to
    // offer the handful of decisions, not the 200 points they produced.
    store().begin({ ...TARGET, waypoints: [point(1), point(2), point(3)] });

    expect(store().waypoints).toHaveLength(3);
  });

  it("does not inherit the previous drawing's points", () => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().begin({ ...TARGET, routeId: "route-2" });

    expect(store().waypoints).toEqual([]);
  });
});

describe("addWaypoint", () => {
  beforeEach(() => store().begin(TARGET));

  it("appends in click order", () => {
    store().addWaypoint(point(1));
    store().addWaypoint(point(2));

    expect(store().waypoints).toEqual([point(1), point(2)]);
  });

  it("reports success so the caller can stay silent", () => {
    expect(store().addWaypoint(point(1))).toBe(true);
  });

  it("refuses past the cap and says so", () => {
    for (let i = 0; i < MAX_WAYPOINTS; i++) store().addWaypoint(point(i));

    // Rejected here rather than by the server: a 201st click would otherwise
    // cost a round trip and come back as a raw zod message.
    expect(store().addWaypoint(point(999))).toBe(false);
    expect(store().waypoints).toHaveLength(MAX_WAYPOINTS);
  });
});

describe("removeWaypoint", () => {
  beforeEach(() => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().addWaypoint(point(2));
    store().addWaypoint(point(3));
  });

  it("drops the point at that index and closes the gap", () => {
    store().removeWaypoint(1);

    expect(store().waypoints).toEqual([point(1), point(3)]);
  });

  it("leaves the list alone for an index that isn't there", () => {
    store().removeWaypoint(9);

    expect(store().waypoints).toHaveLength(3);
  });

  it("can empty the list one point at a time", () => {
    store().removeWaypoint(0);
    store().removeWaypoint(0);
    store().removeWaypoint(0);

    expect(store().waypoints).toEqual([]);
  });
});

describe("undo", () => {
  it("pops the most recent point", () => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().addWaypoint(point(2));

    store().undo();

    expect(store().waypoints).toEqual([point(1)]);
  });

  it("is harmless with nothing drawn", () => {
    store().begin(TARGET);

    store().undo();

    expect(store().waypoints).toEqual([]);
  });

  it("clears a stale snap error so the banner doesn't lie", () => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().setSnapError("Couldn't reach the road network");

    store().undo();

    expect(store().snapError).toBeNull();
  });
});

describe("resetDraft", () => {
  // Regression: right-click on an unselected route opened the menu and closed it
  // in the same tick. The handler selects the route, the route change fires the
  // "abandon the drawing" effect, and that effect used to call reset(), which
  // also cleared contextMenu. Net effect: the menu never appeared for any route
  // that wasn't already selected — which is most of them.
  // Found by /qa on 2026-08-17.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-08-17.md
  it("leaves an open context menu alone", () => {
    store().openContextMenu({
      x: 10,
      y: 20,
      containerWidth: 800,
      containerHeight: 600,
      routeId: "route-1",
      directionId: 0,
    });

    store().resetDraft();

    expect(store().contextMenu).not.toBeNull();
  });

  it("still drops the drawing", () => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().setSegments([{ coordinates: [], straightLine: false }]);

    store().resetDraft();

    expect(store().target).toBeNull();
    expect(store().waypoints).toEqual([]);
    expect(store().segments).toEqual([]);
  });
});

describe("reset", () => {
  it("clears the drawing and any open menu", () => {
    store().begin(TARGET);
    store().addWaypoint(point(1));
    store().openContextMenu({
      x: 10,
      y: 20,
      containerWidth: 800,
      containerHeight: 600,
      routeId: "route-1",
      directionId: 0,
    });

    store().reset();

    expect(store().target).toBeNull();
    expect(store().waypoints).toEqual([]);
    expect(store().segments).toEqual([]);
    expect(store().contextMenu).toBeNull();
  });
});

describe("isDirty", () => {
  it("is false when not drawing", () => {
    expect(isDirty({ target: null, waypoints: [] })).toBe(false);
  });

  it("is false for a drawing with no points yet", () => {
    expect(isDirty({ target: TARGET, waypoints: [] })).toBe(false);
  });

  it("is true once a point exists — that is work worth confirming over", () => {
    expect(isDirty({ target: TARGET, waypoints: [point(1)] })).toBe(true);
  });
});

describe("unsnappedCount", () => {
  const snapped: DraftSegment = { coordinates: [], straightLine: false };
  const straight: DraftSegment = { coordinates: [], straightLine: true };

  it("is zero for a fully snapped line", () => {
    expect(unsnappedCount([snapped, snapped])).toBe(0);
  });

  it("counts only the fallbacks", () => {
    expect(unsnappedCount([snapped, straight, snapped, straight])).toBe(2);
  });

  it("is zero for an empty line", () => {
    expect(unsnappedCount([])).toBe(0);
  });
});
