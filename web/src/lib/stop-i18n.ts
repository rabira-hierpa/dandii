/**
 * Pick the display name for a stop given the reader's locale.
 *
 * `nameAm` is optional and only ever set for a subset of stops (feed
 * translations, a console edit, or the curated hub-name seed — see
 * docs/rewards-and-amharic-design.md and scripts/seed-amharic-stop-names.ts),
 * so an Amharic reader still needs a fallback for the stops nobody has
 * translated yet.
 */
export function localizedStopName(
  stop: { name: string; nameAm?: string | null },
  locale: string,
): string {
  return locale === "am" && stop.nameAm ? stop.nameAm : stop.name;
}
