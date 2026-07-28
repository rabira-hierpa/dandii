import { describe, expect, it } from "vitest";
import {
  journeysFromItineraries,
  legFareEtb,
  operatorFromAgency,
  type OtpPlanItinerary,
  type OtpPlanLeg,
} from "./otp-fallback";

describe("operatorFromAgency", () => {
  it("maps a feed-scoped operator agency to its code", () => {
    expect(operatorFromAgency("1:MINIBUS")).toBe("MINIBUS");
    expect(operatorFromAgency("1:LRT")).toBe("LRT");
  });

  it("accepts an unscoped code", () => {
    expect(operatorFromAgency("SHEGER")).toBe("SHEGER");
  });

  it("returns null for the unassigned 'AA' agency and unknowns", () => {
    expect(operatorFromAgency("1:AA")).toBeNull();
    expect(operatorFromAgency("1:SOMETHING")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(operatorFromAgency(null)).toBeNull();
    expect(operatorFromAgency(undefined)).toBeNull();
  });
});

describe("legFareEtb", () => {
  it("is free for walking", () => {
    expect(legFareEtb(null, "WALK", 5)).toBe(0);
  });

  it("uses LRT tiers for LRT operator or tram/rail mode", () => {
    expect(legFareEtb("LRT", "TRAM", 3)).toBe(10);
    expect(legFareEtb("LRT", "TRAM", 6)).toBe(15);
    expect(legFareEtb("LRT", "TRAM", 10)).toBe(20);
    expect(legFareEtb(null, "TRAM", 2)).toBe(10); // mode wins even without operator
  });

  it("uses minibus tiers", () => {
    expect(legFareEtb("MINIBUS", "BUS", 2)).toBe(15);
    expect(legFareEtb("MINIBUS", "BUS", 5)).toBe(25);
    expect(legFareEtb("MINIBUS", "BUS", 9)).toBe(35);
  });

  it("is flat for Anbessa, and 15 for Sheger/Alliance/unknown", () => {
    expect(legFareEtb("ANBESSA", "BUS", 8)).toBe(10);
    expect(legFareEtb("SHEGER", "BUS", 8)).toBe(15);
    expect(legFareEtb("ALLIANCE", "BUS", 8)).toBe(15);
    expect(legFareEtb(null, "BUS", 8)).toBe(15);
  });
});

// --- journeysFromItineraries fixtures --------------------------------------

function walk(): OtpPlanLeg {
  return {
    mode: "WALK",
    duration: 120,
    distance: 150,
    from: { name: "A", lat: 9, lon: 38 },
    to: { name: "B", lat: 9.001, lon: 38.001 },
    route: null,
    legGeometry: null,
  };
}

function transit(shortName: string, agency: string, distance = 4000): OtpPlanLeg {
  return {
    mode: "BUS",
    duration: 900,
    distance,
    from: { name: "board", lat: 9, lon: 38 },
    to: { name: "alight", lat: 9.02, lon: 38.02 },
    route: { shortName, agency: { gtfsId: agency } },
    legGeometry: null,
  };
}

function itinerary(legs: OtpPlanLeg[], duration = 3600): OtpPlanItinerary {
  return { duration, walkDistance: 200, legs };
}

describe("journeysFromItineraries", () => {
  it("drops pure-walk itineraries", () => {
    expect(journeysFromItineraries([itinerary([walk(), walk()])])).toEqual([]);
  });

  it("dedups OTP's frequency-enumerated near-duplicates", () => {
    const trip = () =>
      itinerary([walk(), transit("SH089", "1:SHEGER"), walk(), transit("AB007", "1:ANBESSA")]);
    const out = journeysFromItineraries([trip(), trip(), trip()]);
    expect(out).toHaveLength(1);
    expect(out[0].transfers).toBe(1); // two transit legs → one transfer
  });

  it("tags a journey with its best (highest-priority) operator", () => {
    const out = journeysFromItineraries([
      itinerary([transit("SH089", "1:SHEGER"), walk(), transit("AB007", "1:ANBESSA")]),
    ]);
    // Sheger (priority 1) beats Anbessa (priority 2).
    expect(out[0].primaryOperator?.code).toBe("SHEGER");
  });

  it("ranks minibus-led before sheger-led before anbessa-led", () => {
    const anbessa = itinerary([transit("AB007", "1:ANBESSA")], 3000);
    const sheger = itinerary([transit("SH089", "1:SHEGER")], 4000);
    const minibus = itinerary([transit("Tx Bole 003", "1:MINIBUS")], 5000);
    const out = journeysFromItineraries([anbessa, sheger, minibus]);
    expect(out.map((j) => j.primaryOperator?.code)).toEqual([
      "MINIBUS",
      "SHEGER",
      "ANBESSA",
    ]);
  });

  it("sums leg fares across the journey", () => {
    // Sheger (15) + Anbessa (10) = 25.
    const out = journeysFromItineraries([
      itinerary([transit("SH089", "1:SHEGER"), walk(), transit("AB007", "1:ANBESSA")]),
    ]);
    expect(out[0].fareEtb).toBe(25);
  });

  it("caps the result at four journeys", () => {
    const many = ["A", "B", "C", "D", "E", "F"].map((n) =>
      itinerary([transit(n, "1:ANBESSA")]),
    );
    expect(journeysFromItineraries(many)).toHaveLength(4);
  });
});
