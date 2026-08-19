import { prisma } from "@/lib/prisma";

/**
 * The one place a route row is created.
 *
 * Two actions create routes: `actions/routes.ts` (the console routes table,
 * permission `route:create`) and `actions/route-edit.ts` (the network-map
 * editor, permission `feedEdit:edit`). The permission split is deliberate and
 * documented in `lib/permissions.ts` — one governs console metadata, the other
 * rewrites what riders see on the map — and in practice the same three roles
 * hold both.
 *
 * What was not deliberate is that the two grew apart. They used different id
 * prefixes, and only one set `origin`. Since `Route.origin` defaults to FEED and
 * the exporter collects created routes with `where: { origin: "OPERATOR" }`, a
 * route added through the routes table appeared on the map and was then silently
 * missing from every published feed.
 *
 * So the entry points stay separate, because their callers and permissions
 * genuinely differ, and the invariants live here where a fix cannot land in one
 * and not the other.
 */

/**
 * Ids for operator-authored entities. The feed uses `node/…` / `way/…` for stops
 * and bare numerics for routes, so an `op:` prefix cannot collide with anything
 * DT4A ships — including a future revision that reuses ids.
 */
export function operatorId(): string {
  return `op:${crypto.randomUUID()}`;
}

export interface NewRoute {
  shortName: string;
  longName: string;
  /** GTFS route_type. */
  type: number;
  color?: string | null;
  textColor?: string | null;
  lengthMeters?: number | null;
  /** Operator to assign, if the caller picked one. */
  operatorId?: string | null;
  /** Recorded on the assignment when the caller tracks who assigned it. */
  assignedById?: string;
}

export type CreateRouteResult =
  | { ok: true; routeId: string }
  | { ok: false; error: string };

export async function createRouteRow(
  input: NewRoute,
): Promise<CreateRouteResult> {
  // agency_id has to name a real agency or the exported feed fails validation.
  const agency = await prisma.agency.findFirst({ select: { id: true } });
  if (!agency) return { ok: false, error: "No agency to attach to" };

  const id = operatorId();
  await prisma.route.create({
    data: {
      id,
      shortName: input.shortName,
      longName: input.longName,
      type: input.type,
      color: input.color ?? null,
      textColor: input.textColor ?? null,
      lengthMeters: input.lengthMeters ?? null,
      agencyId: agency.id,
      // Without this the route is indistinguishable from a feed row, and the
      // exporter — which only collects OPERATOR rows — drops it on publish.
      origin: "OPERATOR",
      ...(input.operatorId
        ? {
            assignment: {
              create: {
                operatorId: input.operatorId,
                ...(input.assignedById
                  ? { assignedById: input.assignedById }
                  : {}),
              },
            },
          }
        : {}),
    },
  });

  return { ok: true, routeId: id };
}
