import { describe, expect, it } from "vitest";
import {
  applyRouteOverridesToCsv,
  applyShapeOverridesToCsv,
  applyStopOverridesToCsv,
  applyStopTimeOrderToCsv,
  applyTripOverridesToCsv,
  translationsCsv,
} from "./gtfs-overrides";

/** Shaped like the vendored DT4A feed, including a comma inside a long name. */
/** Column order and set mirror data/gtfs-2026/combined/routes.txt exactly. */
const ROUTES_CSV = `route_id,route_short_name,route_type,route_long_name,agency_id,route_desc,route_color,route_text_color
10400029,AB097,3,"Megenegna Terminal ↔ Legedadi Mission",AA,,D97706,FFFFFF
10406491,AB083,3,"Ayat Chefe Condominium, Phase 2 ↔ 6 Kilo",AA,,D97706,FFFFFF
`;

const STOPS_CSV = `stop_id,stop_name,stop_lat,stop_lon
node/7037183574,Legedadi Mission,9.0381,38.8774
node/10823916391,Megenagna,9.0425,38.8774
`;

const parse = (csv: string) =>
  csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => line);

describe("applyStopOverridesToCsv", () => {
  it("renames only the overridden stop", () => {
    const out = applyStopOverridesToCsv(STOPS_CSV, [
      { stopId: "node/10823916391", name: "Megenagna Taxi" },
    ]);
    expect(out).toContain("Megenagna Taxi");
    expect(out).toContain("Legedadi Mission"); // untouched
    expect(parse(out)).toHaveLength(2); // no rows added or dropped
  });

  it("returns the base content untouched when nothing is overridden", () => {
    expect(applyStopOverridesToCsv(STOPS_CSV, [])).toBe(STOPS_CSV);
  });

  it("ignores overrides for stops absent from this feed", () => {
    const out = applyStopOverridesToCsv(STOPS_CSV, [
      { stopId: "node/does-not-exist", name: "Ghost" },
    ]);
    expect(out).not.toContain("Ghost");
    expect(parse(out)).toHaveLength(2);
  });

  it("quotes a renamed stop that contains a comma", () => {
    const out = applyStopOverridesToCsv(STOPS_CSV, [
      { stopId: "node/10823916391", name: "Megenagna, Taxi Terminal" },
    ]);
    expect(out).toContain('"Megenagna, Taxi Terminal"');
    // Still 4 columns — an unquoted comma would split the row into 5.
    const row = parse(out).find((r) => r.startsWith("node/10823916391"))!;
    expect(row.match(/,/g)!.length).toBe(4); // 3 separators + 1 inside quotes
  });
});

describe("applyRouteOverridesToCsv", () => {
  const base = {
    shortName: null,
    longName: null,
    color: null,
    textColor: null,
    desc: null,
    url: null,
    type: null,
    continuousPickup: null,
    continuousDropOff: null,
  };

  it("replaces only the edited fields and leaves nulls at the base value", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", shortName: "AB97" },
    ]);
    expect(out).toContain("AB97");
    // longName was null (unedited), so the base value survives.
    expect(out).toContain("Megenegna Terminal ↔ Legedadi Mission");
    expect(out).toContain("D97706");
  });

  it("preserves a base long name that contains a comma", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", shortName: "AB97" },
    ]);
    expect(out).toContain('"Ayat Chefe Condominium, Phase 2 ↔ 6 Kilo"');
  });

  it("keeps the base header and column order", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", color: "1D4ED8" },
    ]);
    expect(out.split("\n")[0]).toBe(ROUTES_CSV.split("\n")[0]);
  });

  it("returns the base content untouched when nothing is overridden", () => {
    expect(applyRouteOverridesToCsv(ROUTES_CSV, [])).toBe(ROUTES_CSV);
  });

  it("leaves the table alone when the id column is missing", () => {
    const notRoutes = "a,b\n1,2\n";
    expect(
      applyRouteOverridesToCsv(notRoutes, [
        { ...base, routeId: "10400029", shortName: "X" },
      ]),
    ).toBe(notRoutes);
  });
});

/**
 * The DT4A feed has no route_url or continuous_* columns, so emitting an
 * operator's value there means widening the header — pinning it to the base
 * feed's columns drops the edit with no error.
 */
describe("header widening for fields the base feed has no column for", () => {
  const base = {
    shortName: null,
    longName: null,
    color: null,
    textColor: null,
    desc: null,
    url: null,
    type: null,
    continuousPickup: null,
    continuousDropOff: null,
  };
  const header = (csv: string) => csv.split("\n")[0].split(",");

  it("adds route_url and carries the value", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", url: "https://dandii.app/r/AB097" },
    ]);
    expect(header(out)).toContain("route_url");
    expect(out).toContain("https://dandii.app/r/AB097");
  });

  it("adds the flag-stop columns when set", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", continuousPickup: 0, continuousDropOff: 0 },
    ]);
    expect(header(out)).toContain("continuous_pickup");
    expect(header(out)).toContain("continuous_drop_off");
  });

  it("does not sprout empty columns when nothing set them", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", shortName: "AB97" },
    ]);
    expect(header(out)).toEqual(header(ROUTES_CSV));
  });

  it("keeps base columns first, in their original order", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", url: "https://x" },
    ]);
    const baseCols = header(ROUTES_CSV);
    expect(header(out).slice(0, baseCols.length)).toEqual(baseCols);
  });

  it("writes route_desc into the column the feed already has", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [
      { ...base, routeId: "10400029", desc: "Express via Megenagna" },
    ]);
    expect(header(out)).toEqual(header(ROUTES_CSV)); // route_desc already exists
    expect(out).toContain("Express via Megenagna");
  });
});

describe("operator-created entities are appended", () => {
  const dataRows = (csv: string) =>
    csv.trim().split("\n").slice(1).filter(Boolean);

  it("appends a created stop with its coordinates", () => {
    const out = applyStopOverridesToCsv(
      STOPS_CSV,
      [],
      [{ id: "op:abc123", name: "New Taxi Terminal", lat: 9.01, lon: 38.76 }],
    );
    expect(dataRows(out)).toHaveLength(3);
    expect(out).toContain("op:abc123");
    expect(out).toContain("New Taxi Terminal");
    expect(out).toContain("38.76");
  });

  it("appends a created route with every base column filled", () => {
    const out = applyRouteOverridesToCsv(
      ROUTES_CSV,
      [],
      [
        {
          id: "op:route1",
          shortName: "TX999",
          longName: "Test ↔ Route",
          type: 3,
          agencyId: "AA",
          color: null,
          textColor: null,
          desc: null,
          url: null,
        },
      ],
    );
    const rows = dataRows(out);
    expect(rows).toHaveLength(3);
    // Ragged rows break GTFS parsers — the appended row must match the header.
    const cols = out.split("\n")[0].split(",").length;
    const appended = rows[rows.length - 1];
    expect(appended.split(",")).toHaveLength(cols);
  });
});

describe("tombstoned entities are omitted", () => {
  const dataRows = (csv: string) =>
    csv.trim().split("\n").slice(1).filter(Boolean);

  it("drops a deleted stop from stops.txt", () => {
    const out = applyStopOverridesToCsv(STOPS_CSV, [], [], [
      "node/10823916391",
    ]);
    expect(dataRows(out)).toHaveLength(1);
    expect(out).not.toContain("node/10823916391");
    expect(out).toContain("Legedadi Mission");
  });

  it("drops a deleted route from routes.txt", () => {
    const out = applyRouteOverridesToCsv(ROUTES_CSV, [], [], ["10400029"]);
    expect(dataRows(out)).toHaveLength(1);
    expect(out).not.toContain("AB097");
  });

  it("a rename on a deleted row does not resurrect it", () => {
    const out = applyStopOverridesToCsv(
      STOPS_CSV,
      [{ stopId: "node/10823916391", name: "Should Not Appear" }],
      [],
      ["node/10823916391"],
    );
    expect(out).not.toContain("Should Not Appear");
    expect(dataRows(out)).toHaveLength(1);
  });
});

/** Mirrors data/gtfs-2026/combined/trips.txt — note there is no block_id. */
const TRIPS_CSV = `service_id,trip_id,route_id,shape_id,direction_id,trip_headsign
S1,t1,10400029,10399952,0,Megenagna Terminal
S1,t2,10400029,10399951,1,Legedadi Mission
`;

describe("applyTripOverridesToCsv", () => {
  const header = (csv: string) => csv.split("\n")[0].split(",");

  it("widens the header to emit block_id, which the feed has no column for", () => {
    const out = applyTripOverridesToCsv(TRIPS_CSV, [
      { tripId: "t1", blockId: "B12", headsign: null },
    ]);
    expect(header(TRIPS_CSV)).not.toContain("block_id");
    expect(header(out)).toContain("block_id");
    expect(out).toContain("B12");
  });

  it("leaves an untouched trip's block empty rather than ragged", () => {
    const rows = TRIPS_CSV.trim().split("\n").length;
    const out = applyTripOverridesToCsv(TRIPS_CSV, [
      { tripId: "t1", blockId: "B12", headsign: null },
    ]);
    expect(out.trim().split("\n")).toHaveLength(rows);
    const cols = out.split("\n")[0].split(",").length;
    for (const line of out.trim().split("\n").slice(1)) {
      expect(line.split(",")).toHaveLength(cols);
    }
  });

  it("patches trip_headsign into the column that already exists", () => {
    const out = applyTripOverridesToCsv(TRIPS_CSV, [
      { tripId: "t2", blockId: null, headsign: "Legedadi via Tafo" },
    ]);
    expect(header(out)).toEqual(header(TRIPS_CSV)); // no widening needed
    expect(out).toContain("Legedadi via Tafo");
  });

  it("returns the feed untouched when no trip was edited", () => {
    expect(applyTripOverridesToCsv(TRIPS_CSV, [])).toBe(TRIPS_CSV);
  });
});


/** Column order mirrors data/gtfs-2026/combined/stop_times.txt exactly. */
const STOP_TIMES_CSV = `trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled,timepoint,continuous_pickup,continuous_drop_off
t1,06:00:00,06:00:00,a,1,,,,,1,,
t1,06:10:00,06:10:00,b,2,,,,,0,,
t1,06:20:00,06:20:00,c,3,,,,,0,,
t2,07:00:00,07:00:00,x,1,,,,,1,,
t2,07:30:00,07:30:00,y,2,,,,,0,,
`;

/** trip_id, stop_id, arrival, stop_sequence for each data row, in file order. */
const calls = (csv: string) =>
  csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const c = line.split(",");
      return { trip: c[0], arrival: c[1], stop: c[3], seq: c[4] };
    });

describe("applyStopTimeOrderToCsv", () => {
  it("returns the feed untouched when nothing was reordered", () => {
    expect(applyStopTimeOrderToCsv(STOP_TIMES_CSV, new Map())).toBe(
      STOP_TIMES_CSV,
    );
  });

  it("re-emits an affected trip in the operator's order", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["c", "b", "a"]]]),
    );

    const t1 = calls(out).filter((r) => r.trip === "t1");
    expect(t1.map((r) => r.stop)).toEqual(["c", "b", "a"]);
  });

  it("keeps times with the position, not the stop", () => {
    // The same contract reorderRouteStops applies in the database: a run
    // reaches its third call at 06:20 whichever stop that is. Carrying each
    // stop's old time along would emit a timetable that goes backwards.
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["c", "b", "a"]]]),
    );

    const t1 = calls(out).filter((r) => r.trip === "t1");
    expect(t1.map((r) => r.arrival)).toEqual([
      "06:00:00",
      "06:10:00",
      "06:20:00",
    ]);
  });

  it("renumbers stop_sequence from 1", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["b", "c", "a"]]]),
    );

    const t1 = calls(out).filter((r) => r.trip === "t1");
    expect(t1.map((r) => r.seq)).toEqual(["1", "2", "3"]);
  });

  it("leaves other trips exactly as they were", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["c", "b", "a"]]]),
    );

    const t2 = calls(out).filter((r) => r.trip === "t2");
    expect(t2.map((r) => r.stop)).toEqual(["x", "y"]);
    expect(t2.map((r) => r.arrival)).toEqual(["07:00:00", "07:30:00"]);
  });

  it("ignores an order that invents a stop the trip doesn't serve", () => {
    // A stale override against a re-vendored feed. Shipping the original order
    // is far better than shipping one with invented calls.
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["a", "b", "zzz"]]]),
    );

    expect(calls(out).filter((r) => r.trip === "t1").map((r) => r.stop)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("ignores an order that drops a call", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["a", "b"]]]),
    );

    expect(calls(out).filter((r) => r.trip === "t1").map((r) => r.stop)).toEqual(
      ["a", "b", "c"],
    );
  });

  it("ignores an order for a trip that isn't in the feed", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["ghost", ["a", "b"]]]),
    );

    expect(calls(out)).toHaveLength(5);
  });

  it("preserves every column of the base header", () => {
    const out = applyStopTimeOrderToCsv(
      STOP_TIMES_CSV,
      new Map([["t1", ["c", "b", "a"]]]),
    );

    expect(out.split("\n")[0]).toBe(STOP_TIMES_CSV.split("\n")[0]);
  });

  it("returns the content untouched when the table isn't stop_times", () => {
    expect(applyStopTimeOrderToCsv(STOPS_CSV, new Map([["t1", ["a"]]]))).toBe(
      STOPS_CSV,
    );
  });
});

/** Column order mirrors data/gtfs-2026/combined/shapes.txt exactly. */
const SHAPES_CSV = `shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence,shape_dist_traveled
s1,9.0107,38.7613,1,
s1,9.0150,38.7650,2,
s1,9.0184,38.7681,3,
s2,9.0300,38.7800,1,
s2,9.0350,38.7850,2,
`;

const shapeRows = (csv: string) =>
  csv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const c = line.split(",");
      return { id: c[0], lat: c[1], lon: c[2], seq: c[3] };
    });

describe("applyShapeOverridesToCsv", () => {
  it("returns the feed untouched when nothing was drawn", () => {
    expect(applyShapeOverridesToCsv(SHAPES_CSV, new Map())).toBe(SHAPES_CSV);
  });

  it("replaces a drawn shape's block outright", () => {
    // The operator redrew the line; the old vertices are not corrections to
    // apply, they are the thing being replaced.
    const drawn: [number, number][] = [
      [38.7, 9.0],
      [38.71, 9.01],
      [38.72, 9.02],
      [38.73, 9.03],
    ];

    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["s1", drawn]]),
    );

    const s1 = shapeRows(out).filter((r) => r.id === "s1");
    expect(s1).toHaveLength(4);
    expect(s1.map((r) => r.lon)).toEqual(["38.7", "38.71", "38.72", "38.73"]);
  });

  it("renumbers points from 1", () => {
    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["s1", [[38.7, 9.0], [38.71, 9.01]] as [number, number][]]]),
    );

    expect(shapeRows(out).filter((r) => r.id === "s1").map((r) => r.seq)).toEqual([
      "1",
      "2",
    ]);
  });

  it("leaves other shapes exactly as they were", () => {
    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["s1", [[38.7, 9.0], [38.71, 9.01]] as [number, number][]]]),
    );

    const s2 = shapeRows(out).filter((r) => r.id === "s2");
    expect(s2.map((r) => [r.lat, r.lon])).toEqual([
      ["9.0300", "38.7800"],
      ["9.0350", "38.7850"],
    ]);
  });

  it("ignores a drawing for a shape the feed does not have", () => {
    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["ghost", [[38.7, 9.0], [38.71, 9.01]] as [number, number][]]]),
    );

    expect(shapeRows(out)).toHaveLength(5);
  });

  it("ignores a drawing too short to be a line", () => {
    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["s1", [[38.7, 9.0]] as [number, number][]]]),
    );

    expect(shapeRows(out).filter((r) => r.id === "s1")).toHaveLength(3);
  });

  it("preserves the base header", () => {
    const out = applyShapeOverridesToCsv(
      SHAPES_CSV,
      new Map([["s1", [[38.7, 9.0], [38.71, 9.01]] as [number, number][]]]),
    );

    expect(out.split("\n")[0]).toBe(SHAPES_CSV.split("\n")[0]);
  });

  it("returns the content untouched when the table isn't shapes", () => {
    expect(
      applyShapeOverridesToCsv(
        STOPS_CSV,
        new Map([["s1", [[38.7, 9.0], [38.71, 9.01]] as [number, number][]]]),
      ),
    ).toBe(STOPS_CSV);
  });
});

describe("translationsCsv", () => {
  it("writes a GTFS-Translations row per stop", () => {
    const csv = translationsCsv([
      { stopId: "1001", nameAm: "መገናኛ" },
      { stopId: "1002", nameAm: "ጦር ኃይሎች" },
    ]);
    const lines = csv.trim().split("\n");

    expect(lines[0]).toBe(
      "table_name,field_name,language,translation,record_id",
    );
    expect(lines[1]).toBe("stops,stop_name,am,መገናኛ,1001");
    expect(lines).toHaveLength(3);
  });

  it("keys by record_id so two stops sharing a name stay distinct", () => {
    // 2,271 Addis stops carry 858 distinct names — the field_value form of
    // the extension would collapse every "Megenagna" into one row.
    const csv = translationsCsv([
      { stopId: "1001", nameAm: "መገናኛ" },
      { stopId: "1002", nameAm: "መገናኛ" },
    ]);

    expect(csv).toContain(",1001\n");
    expect(csv).toContain(",1002\n");
  });

  it("returns nothing when no stop is translated, so no empty file ships", () => {
    expect(translationsCsv([])).toBe("");
  });

  it("quotes a translation containing a comma", () => {
    const csv = translationsCsv([
      { stopId: "1001", nameAm: "መገናኛ, ማዞሪያ" },
    ]);

    expect(csv).toContain('"መገናኛ, ማዞሪያ"');
  });
});
