import { describe, expect, it } from "vitest";
import {
  applyRouteOverridesToCsv,
  applyStopOverridesToCsv,
} from "./gtfs-overrides";

/** Shaped like the vendored DT4A feed, including a comma inside a long name. */
const ROUTES_CSV = `route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color
10400029,AA,AB097,"Megenegna Terminal ↔ Legedadi Mission",3,D97706,FFFFFF
10406491,AA,AB083,"Ayat Chefe Condominium, Phase 2 ↔ 6 Kilo",3,D97706,FFFFFF
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
