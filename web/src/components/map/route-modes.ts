import type { OtpItinerary, OtpLeg } from "./types";

/**
 * The three trip modes surfaced to riders. Colors intentionally mirror
 * familiar consumer-map conventions: blue = primary/fastest, green =
 * savings, purple = scenic/explore.
 */
export type ModeKey = "fastest" | "cheapest" | "scenic";

export interface ModeMeta {
  key: ModeKey;
  label: string;
  tagline: string;
  color: string;
  colorDim: string;
}

export const MODE_META: Record<ModeKey, ModeMeta> = {
  fastest: {
    key: "fastest",
    label: "Fastest",
    tagline: "Least time in transit",
    color: "#1A73E8",
    colorDim: "#A8C7FA",
  },
  cheapest: {
    key: "cheapest",
    label: "Cheapest",
    tagline: "Lowest total fare",
    color: "#188038",
    colorDim: "#A8DAB5",
  },
  scenic: {
    key: "scenic",
    label: "Scenic",
    tagline: "See more of the city",
    color: "#9334E6",
    colorDim: "#D7AEFB",
  },
};

export const MODE_ORDER: ModeKey[] = ["fastest", "cheapest", "scenic"];

/**
 * Estimated fare for one leg in ETB, using the network's default fare
 * structure (route-specific fares live in the DB; this mirrors the seeded
 * defaults keyed by operator, inferred from the GTFS route short name).
 */
export function estimateLegFareEtb(leg: OtpLeg): number {
  if (leg.mode === "WALK") return 0;
  const km = leg.distance / 1000;
  if (leg.mode === "TRAM" || leg.mode === "RAIL") {
    // LRT tiered: 0–4 km / 4–8 km / 8+ km
    return km <= 4 ? 10 : km <= 8 ? 15 : 20;
  }
  const shortName = leg.route?.shortName ?? "";
  if (shortName.startsWith("AB")) return 10; // Anbessa flat
  if (shortName.startsWith("SH")) return 15; // Sheger flat
  if (/^Tx/i.test(shortName)) {
    // Minibus tiered: short hop / mid / full corridor
    return km <= 3 ? 15 : km <= 7 ? 25 : 35;
  }
  return 15; // Alliance and unknown fixed-route buses
}

export function estimateItineraryFareEtb(itinerary: OtpItinerary): number {
  return itinerary.legs.reduce((sum, leg) => sum + estimateLegFareEtb(leg), 0);
}

export function itineraryDistanceMeters(itinerary: OtpItinerary): number {
  return itinerary.legs.reduce((sum, leg) => sum + leg.distance, 0);
}

/** Distinct named places an itinerary passes through (transit ends only). */
export function itineraryPlaces(itinerary: OtpItinerary): string[] {
  const names = new Set<string>();
  for (const leg of itinerary.legs) {
    if (leg.mode === "WALK") continue;
    if (leg.from?.name && leg.from.name !== "Origin") names.add(leg.from.name);
    if (leg.to?.name && leg.to.name !== "Destination") names.add(leg.to.name);
  }
  return [...names];
}

export interface ClassifiedItinerary {
  mode: ModeKey;
  itinerary: OtpItinerary;
  index: number;
  fareEtb: number;
  distanceMeters: number;
  places: string[];
}

/**
 * Pick one itinerary per mode from OTP's alternatives, preferring distinct
 * itineraries per card: fastest = min duration, cheapest = min estimated
 * fare, scenic = max distance covered. When fewer alternatives exist than
 * modes, later modes fall back to the best remaining (possibly duplicate)
 * choice so every returned card is actionable.
 */
export function classifyItineraries(
  itineraries: OtpItinerary[],
): ClassifiedItinerary[] {
  if (itineraries.length === 0) return [];

  const enriched = itineraries.map((itinerary, index) => ({
    itinerary,
    index,
    fareEtb: estimateItineraryFareEtb(itinerary),
    distanceMeters: itineraryDistanceMeters(itinerary),
    places: itineraryPlaces(itinerary),
  }));

  const byMode: Record<ModeKey, (typeof enriched)[number][]> = {
    fastest: [...enriched].sort(
      (a, b) => a.itinerary.duration - b.itinerary.duration,
    ),
    cheapest: [...enriched].sort(
      (a, b) =>
        a.fareEtb - b.fareEtb || a.itinerary.duration - b.itinerary.duration,
    ),
    scenic: [...enriched].sort(
      (a, b) =>
        b.distanceMeters - a.distanceMeters || b.places.length - a.places.length,
    ),
  };

  const used = new Set<number>();
  const result: ClassifiedItinerary[] = [];
  for (const mode of MODE_ORDER) {
    const pick =
      byMode[mode].find((c) => !used.has(c.index)) ?? byMode[mode][0];
    used.add(pick.index);
    result.push({ mode, ...pick });
  }
  return result;
}
