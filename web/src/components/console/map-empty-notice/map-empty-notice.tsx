"use client";

/**
 * Why the console map is empty, when it is.
 *
 * The neighbouring "Loading routes…" overlay exists because an empty basemap
 * "reads as 'no routes' rather than 'still loading'". The same confusion has a
 * second half: once loading finishes and there is still nothing, the map looks
 * broken rather than explaining itself. An Anbessa dispatcher opening a blank
 * Network Map cannot tell whether they lack permission, own no routes, or the
 * feed has no geometry — three different problems with three different people
 * to ask.
 *
 * Renders nothing in the normal case, so it costs a comparison per render.
 */
export function MapEmptyNotice({
  routeCount,
  featureCount,
}: {
  /** Routes visible to this viewer, from the server. */
  routeCount: number;
  /** Geometry features the map received. Null while still loading. */
  featureCount: number | null;
}) {
  if (featureCount === null || featureCount > 0) return null;

  // Routes exist but none of them carry drawn geometry. The console map draws
  // only trips with a shapeId, so a database seeded before per-direction
  // shapes lands here — the fix is a reseed, not a permission change.
  const noGeometry = routeCount > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute top-1/2 left-1/2 z-10 w-[min(24rem,80%)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#E2E6DE] bg-white/95 px-4 py-3 text-center shadow-sm backdrop-blur"
    >
      <div className="text-[13px] font-semibold text-[#1C2321]">
        {noGeometry ? "No route geometry to draw" : "No routes to show"}
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[#5C6B5E]">
        {noGeometry
          ? `${routeCount} route${routeCount === 1 ? "" : "s"} visible, but none carries a drawn shape. The map draws only trips with a shape, so this is missing geometry rather than missing access — the database needs reseeding.`
          : "No routes are visible to you. If you operate a specific agency, an admin assigns routes from Route Assignment."}
      </p>
    </div>
  );
}
