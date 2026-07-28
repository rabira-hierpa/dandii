import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  legGeometry,
  parseGtfsTime,
  tierFareEtb,
} from "./directions";

describe("haversineMeters", () => {
  it("is zero for the same point", () => {
    expect(haversineMeters(9.01, 38.75, 9.01, 38.75)).toBe(0);
  });

  it("measures ~111 km for one degree of latitude", () => {
    const d = haversineMeters(9, 38.75, 10, 38.75);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = haversineMeters(9.0, 38.7, 9.02, 38.8);
    const b = haversineMeters(9.02, 38.8, 9.0, 38.7);
    expect(a).toBeCloseTo(b, 6);
  });

  it("matches the ~139 m Megenagna LRT↔minibus gap", () => {
    // way/758922751 (LRT) vs node/7123180287 (minibus) from the design notes.
    const d = haversineMeters(9.0196319, 38.8026662, 9.0185063, 38.802106);
    expect(d).toBeGreaterThan(120);
    expect(d).toBeLessThan(160);
  });
});

describe("parseGtfsTime", () => {
  it("returns null for null/empty", () => {
    expect(parseGtfsTime(null)).toBeNull();
    expect(parseGtfsTime("")).toBeNull();
  });

  it("parses HH:MM:SS to seconds since midnight", () => {
    expect(parseGtfsTime("06:30:00")).toBe(6 * 3600 + 30 * 60);
    expect(parseGtfsTime("00:00:00")).toBe(0);
    expect(parseGtfsTime("06:15:55")).toBe(6 * 3600 + 15 * 60 + 55);
  });

  it("tolerates a missing seconds field", () => {
    expect(parseGtfsTime("06:30")).toBe(6 * 3600 + 30 * 60);
  });

  it("handles GTFS times past 24h (overnight service)", () => {
    expect(parseGtfsTime("25:00:00")).toBe(25 * 3600);
  });

  it("returns null on garbage", () => {
    expect(parseGtfsTime("abc")).toBeNull();
    expect(parseGtfsTime("6")).toBeNull(); // no colon at all
  });

  it("difference of two offsets is the in-vehicle time", () => {
    const dep = parseGtfsTime("06:00:00")!;
    const arr = parseGtfsTime("06:27:50")!;
    expect(arr - dep).toBe(27 * 60 + 50);
  });
});

describe("tierFareEtb", () => {
  const tiers = [
    { fromKm: 0, toKm: 3, amountEtb: 15 },
    { fromKm: 3, toKm: 7, amountEtb: 25 },
    { fromKm: 7, toKm: null, amountEtb: 35 }, // open-ended top band
  ];

  it("picks the band the distance falls in", () => {
    expect(tierFareEtb(tiers, 2)).toBe(15);
    expect(tierFareEtb(tiers, 5)).toBe(25);
    expect(tierFareEtb(tiers, 12)).toBe(35);
  });

  it("treats band bounds inclusively (first matching wins)", () => {
    expect(tierFareEtb(tiers, 3)).toBe(15); // 3 is <= first band's toKm
    expect(tierFareEtb(tiers, 7)).toBe(25);
  });

  it("uses the top band beyond the last finite bound", () => {
    const finite = [
      { fromKm: 0, toKm: 4, amountEtb: 10 },
      { fromKm: 4, toKm: 8, amountEtb: 15 },
    ];
    expect(tierFareEtb(finite, 20)).toBe(15);
  });

  it("returns null when there are no tiers", () => {
    expect(tierFareEtb([], 5)).toBeNull();
  });
});

describe("legGeometry", () => {
  const board = { lat: 9.02, lon: 38.8 };
  const alight = { lat: 8.99, lon: 38.83 };
  // Dense shape that runs board → alight along "roads".
  const goodShape: GeoJSON.LineString = {
    type: "LineString",
    coordinates: [
      [38.8, 9.02],
      [38.81, 9.01],
      [38.82, 9.0],
      [38.83, 8.99],
    ],
  };
  const stopPolyline: GeoJSON.Position[] = [
    [38.8, 9.02],
    [38.83, 8.99],
  ];

  it("slices the feed shape when it covers both endpoints", () => {
    const { shape, fellBack } = legGeometry(goodShape, board, alight, stopPolyline);
    expect(fellBack).toBe(false);
    // board pinned + 4 shape vertices + alight pinned
    expect(shape.coordinates.length).toBe(6);
    expect(shape.coordinates[0]).toEqual([board.lon, board.lat]);
    expect(shape.coordinates.at(-1)).toEqual([alight.lon, alight.lat]);
  });

  it("reverses the slice when the shape runs the other way", () => {
    const reversed: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [...goodShape.coordinates].reverse(),
    };
    const { shape, fellBack } = legGeometry(reversed, board, alight, stopPolyline);
    expect(fellBack).toBe(false);
    expect(shape.coordinates[0]).toEqual([board.lon, board.lat]);
    expect(shape.coordinates.at(-1)).toEqual([alight.lon, alight.lat]);
  });

  it("falls back when the shape doesn't reach the stops (Tx Kal 033 case)", () => {
    const farShape: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [
        [38.77, 8.9],
        [38.77, 8.95],
      ],
    };
    const { shape, fellBack } = legGeometry(farShape, board, alight, stopPolyline);
    expect(fellBack).toBe(true);
    expect(shape.coordinates).toEqual(stopPolyline);
  });

  it("falls back on a null shape", () => {
    const { shape, fellBack } = legGeometry(null, board, alight, stopPolyline);
    expect(fellBack).toBe(true);
    expect(shape.coordinates).toEqual(stopPolyline);
  });

  it("falls back to a straight line when there's no stop polyline", () => {
    const { shape, fellBack } = legGeometry(null, board, alight, []);
    expect(fellBack).toBe(true);
    expect(shape.coordinates).toEqual([
      [board.lon, board.lat],
      [alight.lon, alight.lat],
    ]);
  });

  it("falls back when both stops snap to the same vertex", () => {
    const twoPoint: GeoJSON.LineString = {
      type: "LineString",
      coordinates: [
        [38.8, 9.02],
        [38.9, 9.1],
      ],
    };
    // A destination a few metres from board → both nearest index 0 → i===j.
    const near = { lat: 9.0205, lon: 38.8005 };
    const { fellBack } = legGeometry(twoPoint, board, near, [
      [38.8, 9.02],
      [38.8005, 9.0205],
    ]);
    expect(fellBack).toBe(true);
  });
});
