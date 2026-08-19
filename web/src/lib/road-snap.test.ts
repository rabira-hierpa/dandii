import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapSegment, snapWaypoints, type Waypoint } from "./road-snap";

/**
 * Meskel Square → Yeka Michael, the corridor the CAR-vs-WALK measurement was
 * taken on. Coordinates only matter here in that they are inside Addis; the
 * routing itself is stubbed.
 */
const MESKEL: Waypoint = { lat: 9.0107, lon: 38.7613 };
const KAZANCHIS: Waypoint = { lat: 9.0184, lon: 38.7681 };
const YEKA: Waypoint = { lat: 9.0392, lon: 38.7891 };

/** An OTP response carrying one leg with the given encoded polyline. */
function otpLegs(...polylines: string[]) {
  return {
    data: {
      plan: {
        itineraries: [
          { legs: polylines.map((points) => ({ legGeometry: { points } })) },
        ],
      },
    },
  };
}

/**
 * Encode [lon, lat] pairs the way OTP does, so fixtures can describe real
 * geometry — in particular two segments that actually meet, which is the only
 * way to exercise the joint dedupe.
 */
function encodePolyline(points: [number, number][]): string {
  let lastLat = 0;
  let lastLon = 0;
  let out = "";
  const chunk = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let s = "";
    while (v >= 0x20) {
      s += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of points) {
    const latE5 = Math.round(lat * 1e5);
    const lonE5 = Math.round(lon * 1e5);
    out += chunk(latE5 - lastLat) + chunk(lonE5 - lastLon);
    lastLat = latE5;
    lastLon = lonE5;
  }
  return out;
}

const TWO_POINT_LINE = encodePolyline([
  [MESKEL.lon, MESKEL.lat],
  [KAZANCHIS.lon, KAZANCHIS.lat],
]);
/** Starts exactly where TWO_POINT_LINE ends — the joint the merge must drop. */
const TOUCHING_LINE = encodePolyline([
  [KAZANCHIS.lon, KAZANCHIS.lat],
  [YEKA.lon, YEKA.lat],
]);

function mockFetchOnce(body: unknown) {
  return vi.fn().mockResolvedValue({ json: () => Promise.resolve(body) });
}

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetchOnce(otpLegs(TWO_POINT_LINE)));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("snapSegment", () => {
  it("returns the decoded road geometry when OTP routes it", async () => {
    const segment = await snapSegment(MESKEL, YEKA);

    expect(segment.straightLine).toBe(false);
    expect(segment.coordinates.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a straight line when OTP finds no itinerary", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchOnce({ data: { plan: { itineraries: [] } } }),
    );

    const segment = await snapSegment(MESKEL, YEKA);

    // Flagged rather than silently substituted: the map draws these dashed so
    // the gap in the data is visible instead of laundered into the geometry.
    expect(segment.straightLine).toBe(true);
    expect(segment.coordinates).toEqual([
      [MESKEL.lon, MESKEL.lat],
      [YEKA.lon, YEKA.lat],
    ]);
  });

  it("falls back to a straight line when the request throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const segment = await snapSegment(MESKEL, YEKA);

    expect(segment.straightLine).toBe(true);
  });

  it("falls back to a straight line when the request times out", async () => {
    // A hung OTP never rejects on its own — the abort signal is what turns the
    // hang into a rejection the catch can convert into a usable segment.
    const timeout = Object.assign(new Error("The operation was aborted"), {
      name: "TimeoutError",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout));

    const segment = await snapSegment(MESKEL, YEKA);

    expect(segment.straightLine).toBe(true);
    expect(segment.coordinates).toHaveLength(2);
  });

  it("sends an abort signal so a hung OTP cannot stall the preview", async () => {
    const fetchSpy = mockFetchOnce(otpLegs(TWO_POINT_LINE));
    vi.stubGlobal("fetch", fetchSpy);

    await snapSegment(MESKEL, YEKA);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("asks OTP for CAR, not WALK", async () => {
    const fetchSpy = mockFetchOnce(otpLegs(TWO_POINT_LINE));
    vi.stubGlobal("fetch", fetchSpy);

    await snapSegment(MESKEL, YEKA);

    // WALK routes over footbridges, stairs and pedestrian squares a minibus
    // cannot drive — 5,488m of them on this corridor against 4,758m by road.
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as RequestInit).body as string,
    );
    expect(body.query).toContain("mode: CAR");
    expect(body.query).not.toContain("mode: WALK");
  });
});

describe("snapWaypoints", () => {
  it("returns no segments for fewer than two waypoints", async () => {
    const result = await snapWaypoints([MESKEL]);

    expect(result.segments).toEqual([]);
    expect(result.unsnappedCount).toBe(0);
    expect(result.coordinates).toEqual([[MESKEL.lon, MESKEL.lat]]);
  });

  it("returns nothing at all for an empty list", async () => {
    const result = await snapWaypoints([]);

    expect(result.coordinates).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  it("requests one segment per gap between waypoints", async () => {
    const fetchSpy = mockFetchOnce(otpLegs(TWO_POINT_LINE));
    vi.stubGlobal("fetch", fetchSpy);

    await snapWaypoints([MESKEL, KAZANCHIS, YEKA]);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("drops the duplicated joint between consecutive segments", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        call += 1;
        const index = call;
        return Promise.resolve({
          json: () =>
            Promise.resolve(
              otpLegs(index === 1 ? TWO_POINT_LINE : TOUCHING_LINE),
            ),
        });
      }),
    );

    const result = await snapWaypoints([MESKEL, KAZANCHIS, YEKA]);

    // Two 2-point segments meeting at Kazanchis is three points, not four: the
    // shared endpoint must appear once or the line carries a zero-length span.
    expect(result.coordinates).toHaveLength(3);
    for (let i = 1; i < result.coordinates.length; i++) {
      expect(result.coordinates[i]).not.toEqual(result.coordinates[i - 1]);
    }
  });

  it("counts how many segments fell back to a straight line", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        call += 1;
        // Captured per call: read lazily inside json(), both requests would see
        // the final value and the test would assert against itself.
        const index = call;
        // First gap routes, second doesn't.
        return Promise.resolve({
          json: () =>
            Promise.resolve(
              index === 1
                ? otpLegs(TWO_POINT_LINE)
                : { data: { plan: { itineraries: [] } } },
            ),
        });
      }),
    );

    const result = await snapWaypoints([MESKEL, KAZANCHIS, YEKA]);

    expect(result.segments).toHaveLength(2);
    expect(result.unsnappedCount).toBe(1);
    expect(result.segments[0].straightLine).toBe(false);
    expect(result.segments[1].straightLine).toBe(true);
  });

  it("never has more than six requests in flight at once", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        return new Promise((resolve) => {
          setTimeout(() => {
            inFlight -= 1;
            resolve({ json: () => Promise.resolve(otpLegs(TWO_POINT_LINE)) });
          }, 5);
        });
      }),
    );

    // 20 waypoints is 19 gaps. Unbounded, that is 19 simultaneous requests at a
    // single OTP container that also answers every rider's journey plan.
    const many = Array.from({ length: 20 }, (_, i) => ({
      lat: 9.01 + i * 0.001,
      lon: 38.76 + i * 0.001,
    }));
    const result = await snapWaypoints(many);

    expect(result.segments).toHaveLength(19);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it("keeps segments in waypoint order despite the concurrency cap", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => {
        call += 1;
        const index = call;
        return new Promise((resolve) => {
          // Later requests resolve first, so order can only survive if the
          // runner writes results back by index rather than by completion.
          setTimeout(
            () =>
              resolve({
                json: () =>
                  Promise.resolve(
                    index === 2
                      ? { data: { plan: { itineraries: [] } } }
                      : otpLegs(TWO_POINT_LINE),
                  ),
              }),
            index === 1 ? 20 : 1,
          );
        });
      }),
    );

    const result = await snapWaypoints([MESKEL, KAZANCHIS, YEKA]);

    expect(result.segments[0].straightLine).toBe(false);
    expect(result.segments[1].straightLine).toBe(true);
  });
});
