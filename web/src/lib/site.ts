/**
 * Canonical public origin for absolute URLs (sitemap, OG, JSON-LD).
 * Prefer NEXT_PUBLIC_SITE_URL; fall back to BETTER_AUTH_URL; then production.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "https://dandii.et";
  return raw.replace(/\/$/, "");
}

export const SITE = {
  name: "Dandii",
  tagline: "Addis Ababa Transit Map",
  description:
    "Dandii unifies Anbessa and Sheger buses, Alliance, minibus taxis, and the Addis Light Rail on one live map — search 447 routes, check fares, and plan journeys across Addis Ababa with official GTFS data.",
  shortDescription:
    "Live map of Addis Ababa public transport: minibuses, buses, Light Rail, fares, and journey planning.",
  locale: "en_ET",
  keywords: [
    "Dandii",
    "Addis Ababa transit",
    "Addis Ababa bus map",
    "Addis Ababa minibus",
    "Addis Ababa taxi",
    "Addis Ababa public transport",
    "Lada taxi",
    "Anbessa bus",
    "Sheger bus",
    "Addis Light Rail",
    "Addis Ababa LRT",
    "GTFS Addis Ababa",
    "Ethiopia public transport",
    "Addis Ababa journey planner",
    "Addis Ababa route fares",
    "woyala",
    "minibus taxi Addis",
    "public transport Addis",
    "public transport map Addis",
  ],
} as const;
