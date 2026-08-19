import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Amharic stop names have to survive the trip from the database to the map.
 *
 * They did not. `nameAm` was threaded through the client types, the display
 * helper and three endpoints, but the three endpoints that feed the stops you
 * see when you open a route never selected the column. Because `nameAm` is
 * optional on the client types, nothing type-checked wrong and
 * `localizedStopName` quietly fell back to English for every stop on a
 * selected route.
 *
 * These tests only mean something if the prisma stub honours `select` the way
 * Prisma does. A stub that returns the whole fixture regardless would pass
 * against the broken code, which is the trap that let the bug through.
 */

/** Project a fixture through a Prisma `select`, including nested relations. */
function applySelect<T>(row: T, select: Record<string, unknown> | undefined): unknown {
  if (!select) return row;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(select)) {
    if (spec === true) {
      out[key] = (row as Record<string, unknown>)[key];
    } else if (spec && typeof spec === "object") {
      const nested = (spec as { select?: Record<string, unknown> }).select;
      const value = (row as Record<string, unknown>)[key];
      out[key] = Array.isArray(value)
        ? value.map((v) => applySelect(v, nested))
        : value === null || value === undefined
          ? value
          : applySelect(value, nested);
    }
  }
  return out;
}

const AYAT = {
  id: "node/7037183519",
  name: "Ayat",
  nameAm: "አያት",
  lat: 9.02,
  lon: 38.9,
  sequence: 1,
};

const ROUTE_ROW = {
  id: "10400029",
  shortName: "A1",
  longName: "Ayat ↔ Piassa",
  type: 3,
  color: null,
  textColor: null,
  lengthMeters: null,
  geojson: null,
  assignment: { operator: { code: "ANBESSA", name: "Anbessa" } },
  fares: [],
  closures: [],
  trips: [{ id: "t1", frequencies: [], stopTimes: [{ sequence: 1, stop: AYAT }] }],
};

const prisma = vi.hoisted(() => ({
  route: { findUnique: vi.fn() },
  stop: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/transit", () => ({
  activeClosureFilter: () => ({}),
  summarizeFare: () => null,
}));
vi.mock("@/lib/closures", () => ({ describeClosure: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  prisma.route.findUnique.mockImplementation(({ select }) =>
    Promise.resolve(applySelect(ROUTE_ROW, select)),
  );
  prisma.stop.findMany.mockImplementation(({ select }) =>
    Promise.resolve([applySelect(AYAT, select)]),
  );
});

describe("GET /api/routes/[routeId]", () => {
  it("sends the Amharic name with each stop on the selected route", async () => {
    const { GET } = await import("./routes/[routeId]/route");
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ routeId: "10400029" }),
    });
    const body = await res.json();

    expect(body.stops[0].nameAm).toBe("አያት");
  });
});

describe("GET /api/routes/[routeId]/hover", () => {
  it("sends the Amharic name with each hovered stop", async () => {
    const { GET } = await import("./routes/[routeId]/hover/route");
    const res = await GET(new Request("http://t/"), {
      params: Promise.resolve({ routeId: "10400029" }),
    });
    const body = await res.json();
    const stops = body.stops ?? [];

    expect(stops[0]?.nameAm).toBe("አያት");
  });
});

describe("GET /api/geo/stops", () => {
  it("puts the Amharic name in the feature properties", async () => {
    const { GET } = await import("./geo/stops/route");
    const res = await GET();
    const body = await res.json();

    expect(body.features[0].properties.nameAm).toBe("አያት");
  });
});
