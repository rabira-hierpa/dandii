import { loadDirectionalFeatureCollection } from "@/lib/route-shape-features";
import { requirePermissionScope } from "@/lib/session";

/**
 * Route geometry for the console map, limited to the viewer's operator.
 *
 * A separate endpoint rather than a flag on `/api/geo/routes`, which is
 * deliberately unauthenticated because the public rider map depends on it.
 * One endpoint whose results depend on who is asking is the ambient-identity
 * trap; two endpoints have two obvious contracts.
 *
 * Always both directions: the console edits each direction separately.
 */
export async function GET() {
  const { routeWhere } = await requirePermissionScope({ route: ["read"] });
  const { features } = await loadDirectionalFeatureCollection(routeWhere);

  return Response.json(
    { type: "FeatureCollection", features },
    // Operator-facing and edited constantly — never serve a stale network.
    { headers: { "Cache-Control": "no-store" } },
  );
}
