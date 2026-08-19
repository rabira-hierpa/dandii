import { describe, expect, it } from "vitest";
import {
  closedStopIds,
  closedWindow,
  describeClosure,
  isPairBlocked,
  isPairClosed,
  resolveClosedWindow,
  type TripStop,
  type ClosureRange,
} from "./closures";

/**
 * The screenshot case: Tx YK 016 runs
 *   0 Megenagna → 1 Lem Hotel → 2 22 Mazoria → 3 Stadium → 4 Legehar → 5 Mexico
 * The road is blocked past 22 Mazoria, so the closed range is Stadium…Mexico.
 */
const STOPS = [
  { id: "megenagna", name: "Megenagna" },
  { id: "lem", name: "Lem Hotel" },
  { id: "mazoria22", name: "22 Mazoria" },
  { id: "stadium", name: "Stadium" },
  { id: "legehar", name: "Legehar" },
  { id: "mexico", name: "Mexico" },
];
const SEQ = new Map(STOPS.map((s, i) => [s.id, i]));
/** The same trip running the other way — sequences reversed. */
const SEQ_REVERSE = new Map(STOPS.map((s, i) => [s.id, STOPS.length - 1 - i]));

const severedTail: ClosureRange = {
  kind: "SEVERED",
  fromStopId: "stadium",
  toStopId: "mexico",
};
const skippedMiddle: ClosureRange = {
  kind: "SKIPPED",
  fromStopId: "stadium",
  toStopId: "legehar",
};
const severedMiddle: ClosureRange = {
  kind: "SEVERED",
  fromStopId: "stadium",
  toStopId: "legehar",
};
const wholeRoute: ClosureRange = {
  kind: "WHOLE_ROUTE",
  fromStopId: null,
  toStopId: null,
};

describe("closedWindow", () => {
  it("resolves stop ids to an inclusive sequence range", () => {
    expect(closedWindow(severedTail, SEQ)).toEqual({ start: 3, end: 5 });
  });

  it("normalizes order, so the reverse-direction trip gets the same stretch", () => {
    // Reversed trip: Mexico=0 … Stadium=2, so from/to arrive swapped.
    expect(closedWindow(severedTail, SEQ_REVERSE)).toEqual({ start: 0, end: 2 });
  });

  it("returns null for a whole-route closure", () => {
    expect(closedWindow(wholeRoute, SEQ)).toBeNull();
  });

  it("returns null when the trip doesn't serve both boundary stops", () => {
    const partial = new Map([["megenagna", 0], ["lem", 1]]);
    expect(closedWindow(severedTail, partial)).toBeNull();
  });
});

describe("isPairBlocked — the screenshot case (SEVERED tail)", () => {
  const w = closedWindow(severedTail, SEQ);

  it("still allows the working leg: Megenagna → 22 Mazoria", () => {
    expect(isPairBlocked(severedTail, w, 0, 2)).toBe(false);
  });

  it("blocks Megenagna → Mexico (destination is in the closed stretch)", () => {
    expect(isPairBlocked(severedTail, w, 0, 5)).toBe(true);
  });

  it("blocks boarding inside the closed stretch", () => {
    expect(isPairBlocked(severedTail, w, 3, 5)).toBe(true);
  });

  it("allows a pair entirely before the closure", () => {
    expect(isPairBlocked(severedTail, w, 0, 1)).toBe(false);
  });
});

describe("SEVERED vs SKIPPED — the through-travel distinction", () => {
  const wSkip = closedWindow(skippedMiddle, SEQ);
  const wSever = closedWindow(severedMiddle, SEQ);

  it("SKIPPED allows travel across the closed stops", () => {
    // Megenagna → Mexico: the bus detours, so the trip still works.
    expect(isPairBlocked(skippedMiddle, wSkip, 0, 5)).toBe(false);
  });

  it("SEVERED blocks travel across the same stops", () => {
    // Road is blocked, so nothing gets from one side to the other.
    expect(isPairBlocked(severedMiddle, wSever, 0, 5)).toBe(true);
  });

  it("both block boarding or alighting at a closed stop", () => {
    expect(isPairBlocked(skippedMiddle, wSkip, 0, 3)).toBe(true);
    expect(isPairBlocked(severedMiddle, wSever, 0, 3)).toBe(true);
  });

  it("SEVERED still allows a pair wholly on one side of the break", () => {
    // Megenagna → 22 Mazoria, entirely before the closed Stadium…Legehar run.
    expect(isPairBlocked(severedMiddle, wSever, 0, 2)).toBe(false);
  });

  it("blocks boarding at a closed stop even when heading away from the break", () => {
    // Legehar itself is closed, so Legehar → Mexico is not rideable either.
    expect(isPairBlocked(severedMiddle, wSever, 4, 5)).toBe(true);
  });
});

describe("WHOLE_ROUTE", () => {
  it("blocks every pair", () => {
    expect(isPairBlocked(wholeRoute, null, 0, 1)).toBe(true);
    expect(isPairBlocked(wholeRoute, null, 4, 5)).toBe(true);
  });
});

describe("isPairClosed", () => {
  it("is false when no closure applies", () => {
    expect(isPairClosed([], SEQ, 0, 5)).toBe(false);
  });

  it("blocks if ANY active closure blocks the pair", () => {
    expect(isPairClosed([skippedMiddle, severedTail], SEQ, 0, 5)).toBe(true);
  });

  it("allows a pair no closure touches", () => {
    expect(isPairClosed([severedTail], SEQ, 0, 1)).toBe(false);
  });
});

describe("describeClosure", () => {
  it("names the still-usable leg for a severed tail", () => {
    const s = describeClosure(severedTail, STOPS);
    expect(s).toContain("Megenagna");
    expect(s).toContain("22 Mazoria");
    expect(s).toContain("Stadium, Legehar and Mexico");
  });

  it("names both islands for a mid-route SEVERED cut", () => {
    const s = describeClosure(severedMiddle, STOPS);
    expect(s).toContain("cut in two");
    expect(s).toContain("Megenagna");
    expect(s).toContain("Mexico");
  });

  it("names the usable tail when the head is severed", () => {
    const head: ClosureRange = {
      kind: "SEVERED",
      fromStopId: "megenagna",
      toStopId: "mazoria22",
    };
    const s = describeClosure(head, STOPS);
    expect(s).toContain("Stadium");
    expect(s).toContain("Mexico");
  });

  it("says the route still runs when stops are skipped", () => {
    expect(describeClosure(skippedMiddle, STOPS)).toContain("skip");
  });

  it("describes a whole-route closure plainly", () => {
    expect(describeClosure(wholeRoute, STOPS)).toContain("whole route");
  });
});

describe("otpBannedRouteGtfsIds", () => {
  it("prefixes route ids with the feed scope", async () => {
    const { otpBannedRouteGtfsIds } = await import("./closures");
    expect(otpBannedRouteGtfsIds(["104", "105"])).toBe("1:104,1:105");
  });
});

describe("closedStopIds", () => {
  it("returns every stop for a whole-route closure", () => {
    expect([...closedStopIds(wholeRoute, STOPS)]).toEqual(STOPS.map((s) => s.id));
  });

  it("returns only the closed window for a partial closure", () => {
    expect([...closedStopIds(severedTail, STOPS)].sort()).toEqual(
      ["stadium", "legehar", "mexico"].sort(),
    );
  });
});

describe("splitShapeByClosureWindow", () => {
  const LAT0 = 9.0;
  const LON0 = 38.8;
  /** A straight north-south line of `n` vertices, `spacingM` apart. */
  const line = (n: number, spacingM: number): number[][] =>
    Array.from({ length: n }, (_, i) => [
      LON0,
      LAT0 + (i * spacingM) / 110_574,
    ]);
  const vertex = (coords: number[][], i: number) => ({
    lon: coords[i][0],
    lat: coords[i][1],
  });

  it("slices a dense shape into the open sides and the closed middle", async () => {
    const { splitShapeByClosureWindow } = await import("./closures");
    const coords = line(100, 50);
    const split = splitShapeByClosureWindow(
      coords,
      vertex(coords, 40),
      vertex(coords, 60),
    );
    expect(split).not.toBeNull();
    expect(split!.closed).toHaveLength(21); // 40…60 inclusive
    expect(split!.open).toHaveLength(2);
    expect(split!.open[0]).toHaveLength(41); // 0…40
    expect(split!.open[1]).toHaveLength(40); // 60…99
  });

  it("emits a single open side when the closure starts at the first stop", async () => {
    const { splitShapeByClosureWindow } = await import("./closures");
    const coords = line(100, 50);
    const split = splitShapeByClosureWindow(
      coords,
      vertex(coords, 0),
      vertex(coords, 30),
    );
    expect(split!.open).toHaveLength(1);
    expect(split!.closed).toHaveLength(31);
  });

  /**
   * Regression: partial closures must be sliced from the FULL route shape.
   * `geojsonSimplified` leaves ~500m between vertices, so adjacent stops land
   * on the same vertex and the split silently degrades to a whole-route
   * closure — a 16km route painted shut for a two-stop disruption.
   */
  it("returns null when both stops collapse onto one vertex", async () => {
    const { splitShapeByClosureWindow } = await import("./closures");
    const sparse = line(32, 500);
    const near = vertex(sparse, 10);
    const split = splitShapeByClosureWindow(
      sparse,
      { lat: near.lat + 0.0005, lon: near.lon },
      { lat: near.lat - 0.0005, lon: near.lon },
    );
    expect(split).toBeNull();
  });

  it("returns null when a stop sits beyond the snap tolerance", async () => {
    const { splitShapeByClosureWindow } = await import("./closures");
    const coords = line(100, 50);
    const split = splitShapeByClosureWindow(
      coords,
      { lat: LAT0, lon: LON0 + 0.05 }, // ~5.5km off the line
      vertex(coords, 60),
    );
    expect(split).toBeNull();
  });
});

describe("itineraryTouchesSkippedStops", () => {
  it("flags a transit board/alight at a skipped stop name", async () => {
    const { itineraryTouchesSkippedStops } = await import("./closures");
    const skipped = new Set(["stadium"]);
    expect(
      itineraryTouchesSkippedStops(
        [
          {
            mode: "BUS",
            from: { name: "Megenagna" },
            to: { name: "Stadium" },
          },
        ],
        skipped,
      ),
    ).toBe(true);
    expect(
      itineraryTouchesSkippedStops(
        [
          {
            mode: "BUS",
            from: { name: "Megenagna" },
            to: { name: "Mexico" },
          },
        ],
        skipped,
      ),
    ).toBe(false);
  });
});

/**
 * Cross-direction resolution.
 *
 * A closure is stored as two stop ids. 406 of the 444 two-direction routes in
 * the feed share NO stop ids between their directions (verified against the dev
 * database 2026-08-18) — the outbound and return sides of a road are separate
 * stops with separate ids. So an operator who closes a stretch by picking
 * outbound stops leaves the return direction planning as if the road were open,
 * which is the failure these cover.
 */
const OUTBOUND: TripStop[] = [
  { id: "out-1", sequence: 1, lat: 9.0107, lon: 38.7613 },
  { id: "out-2", sequence: 2, lat: 9.0150, lon: 38.7650 },
  { id: "out-3", sequence: 3, lat: 9.0184, lon: 38.7681 },
  { id: "out-4", sequence: 4, lat: 9.0250, lon: 38.7750 },
];

/** The same road the other way: different ids, ~20 m across the carriageway. */
const RETURN: TripStop[] = [
  { id: "ret-1", sequence: 1, lat: 9.02505, lon: 38.77515 },
  { id: "ret-2", sequence: 2, lat: 9.01845, lon: 38.76825 },
  { id: "ret-3", sequence: 3, lat: 9.01505, lon: 38.76515 },
  { id: "ret-4", sequence: 4, lat: 9.01075, lon: 38.76145 },
  // One more call past the far end, so "a journey clear of the closure" is an
  // actual journey and not a single stop.
  { id: "ret-5", sequence: 5, lat: 9.0050, lon: 38.7570 },
];

const severed: ClosureRange = {
  kind: "SEVERED",
  fromStopId: "out-2",
  toStopId: "out-3",
};

/** Where the boundary stops actually are, for trips that don't serve them. */
const ANCHORS = new Map(
  OUTBOUND.map((s) => [s.id, { lat: s.lat, lon: s.lon }]),
);

describe("resolveClosedWindow", () => {
  it("uses exact stop ids when the trip actually serves them", () => {
    const w = resolveClosedWindow(severed, OUTBOUND, 150);

    expect(w).toEqual({ start: 2, end: 3 });
  });

  it("resolves onto the return direction by position", () => {
    // out-2/out-3 are not in RETURN at all. Their opposite numbers are ret-3
    // and ret-2, so the closed window is sequences 2..3 the other way round.
    const w = resolveClosedWindow(severed, RETURN, 150, ANCHORS);

    expect(w).toEqual({ start: 2, end: 3 });
  });

  it("blocks a return-direction journey across the closed stretch", () => {
    // The bug: this returned false, and a rider was routed straight through a
    // road the operator had closed.
    const w = resolveClosedWindow(severed, RETURN, 150, ANCHORS);

    expect(isPairBlocked(severed, w, 1, 4)).toBe(true);
  });

  it("still allows a return journey that stays clear of the closure", () => {
    const w = resolveClosedWindow(severed, RETURN, 150, ANCHORS);

    // Both ends past the closed window (which lands on sequences 2-3 here).
    expect(isPairBlocked(severed, w, 4, 5)).toBe(false);
  });

  it("refuses to snap a stop that is genuinely far away", () => {
    // A different route that happens to be active. Snapping here would close
    // roads nobody closed.
    const elsewhere: TripStop[] = [
      { id: "far-1", sequence: 1, lat: 9.0600, lon: 38.8300 },
      { id: "far-2", sequence: 2, lat: 9.0650, lon: 38.8350 },
    ];

    expect(resolveClosedWindow(severed, elsewhere, 150, ANCHORS)).toBeNull();
  });

  it("returns null when the closure has no range", () => {
    const whole: ClosureRange = {
      kind: "WHOLE_ROUTE",
      fromStopId: null,
      toStopId: null,
    };

    expect(resolveClosedWindow(whole, OUTBOUND, 150)).toBeNull();
  });

  it("orders the window even when the directions run opposite ways", () => {
    // from/to are outbound order; on the return they resolve reversed. The
    // window must still come back low-to-high or every comparison inverts.
    const w = resolveClosedWindow(severed, RETURN, 150, ANCHORS)!;

    expect(w.start).toBeLessThanOrEqual(w.end);
  });

  it("resolves a mixed trip where only one endpoint matches by id", () => {
    // Interchanges sometimes share one stop between directions but not both.
    const mixed: TripStop[] = [
      { id: "out-2", sequence: 1, lat: 9.0150, lon: 38.7650 },
      { id: "ret-2", sequence: 2, lat: 9.01845, lon: 38.76825 },
      { id: "ret-1", sequence: 3, lat: 9.02505, lon: 38.77515 },
    ];

    expect(resolveClosedWindow(severed, mixed, 150, ANCHORS)).toEqual({
      start: 1,
      end: 2,
    });
  });
});
