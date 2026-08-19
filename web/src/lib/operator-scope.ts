import type { OperatorCode } from "@/lib/operators";
import { OPERATOR_SCOPED_ROLES, type AppRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Per-operator authorization for the feed editor.
 *
 * `requirePermission` answers "may this role edit the feed at all". It cannot
 * answer "may this Anbessa dispatcher edit an LRT route", because the role
 * carries no operator. That second question is this module's job, and every
 * feed-edit action has to ask it — a scope the UI shows but the server never
 * checks is worse than no scope at all, because it reads as enforcement.
 *
 * The scope is read from the database on each call rather than taken from the
 * session. A session cookie outlives a change of scope, and the whole point of
 * revoking someone's operator is that it takes effect now.
 */

/** Thrown on a scope violation. Mirrors `requirePermission`'s Forbidden shape. */
export class OperatorScopeError extends Error {
  constructor(message: string) {
    super(`Forbidden: ${message}`);
    this.name = "OperatorScopeError";
  }
}

/**
 * The operator this user is pinned to, or null for the network-wide roles
 * (super-admin, admin, maintainer). A user id with no row is treated as
 * scoped-to-nothing rather than network-wide — fail closed.
 */
export async function getUserOperatorCode(
  userId: string,
): Promise<OperatorCode | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, operatorCode: true },
  });
  if (!user) throw new OperatorScopeError("unknown user");

  // A scoped role with no operator is not network-wide, it is misconfigured —
  // and the way it arises is a demotion through better-auth's own setRole,
  // which knows nothing about this column. Refusing here means the worst a
  // stale role change can do is block edits, never widen them.
  if (
    OPERATOR_SCOPED_ROLES.includes((user.role ?? "user") as AppRole) &&
    user.operatorCode === null
  ) {
    throw new OperatorScopeError(
      "your account has no operator assigned — ask an admin to set one",
    );
  }
  return user.operatorCode as OperatorCode | null;
}

/**
 * Assert every one of `routeIds` is assigned to the user's operator.
 *
 * A route with no assignment is refused for scoped users: unassigned means
 * nobody owns it, not everybody does. Admins (null scope) still reach it.
 */
export async function assertRoutesInScope(
  userId: string,
  routeIds: readonly string[],
): Promise<void> {
  if (routeIds.length === 0) return;
  const scope = await getUserOperatorCode(userId);
  if (scope === null) return;

  const ids = [...new Set(routeIds)];
  const assignments = await prisma.routeAssignment.findMany({
    where: { routeId: { in: ids } },
    select: { routeId: true, operator: { select: { code: true } } },
  });
  const byRoute = new Map(assignments.map((a) => [a.routeId, a.operator.code]));

  for (const routeId of ids) {
    const owner = byRoute.get(routeId);
    if (owner === undefined) {
      throw new OperatorScopeError(
        `route ${routeId} is not assigned to any operator`,
      );
    }
    if (owner !== scope) {
      throw new OperatorScopeError(
        `route ${routeId} belongs to ${owner}, not ${scope}`,
      );
    }
  }
}

/** Convenience wrapper for the common single-route case. */
export async function assertRouteInScope(
  userId: string,
  routeId: string,
): Promise<void> {
  return assertRoutesInScope(userId, [routeId]);
}

/**
 * Assert a stop is editable by this user.
 *
 * A stop is shared: renaming Megenagna changes it for every operator whose
 * line calls there. So a scoped user may edit a stop only when *every* route
 * serving it is theirs — a genuine interchange is a network asset and stays
 * with the admins. A stop no route serves yet is allowed through, since an
 * edit to it cannot reach anyone else's line.
 */
export async function assertStopInScope(
  userId: string,
  stopId: string,
): Promise<void> {
  const scope = await getUserOperatorCode(userId);
  if (scope === null) return;

  const serving = await prisma.stopTime.findMany({
    where: { stopId },
    select: { trip: { select: { routeId: true } } },
    distinct: ["tripId"],
  });
  const routeIds = [...new Set(serving.map((s) => s.trip.routeId))];
  if (routeIds.length === 0) return;

  await assertRoutesInScope(userId, routeIds);
}

/** Assert the trip's route is in scope. */
export async function assertTripInScope(
  userId: string,
  tripId: string,
): Promise<void> {
  const scope = await getUserOperatorCode(userId);
  if (scope === null) return;

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { routeId: true },
  });
  if (!trip) throw new OperatorScopeError("unknown trip");
  return assertRoutesInScope(userId, [trip.routeId]);
}

/**
 * The operator a scoped user's newly created route must be assigned to.
 * Network-wide users pass their own choice through untouched; a scoped user
 * gets their own operator regardless of what the client asked for.
 */
export async function resolveCreateOperator(
  userId: string,
  requested: OperatorCode | null | undefined,
): Promise<OperatorCode | null> {
  const scope = await getUserOperatorCode(userId);
  return scope ?? requested ?? null;
}

/** What `denyOutOfScope` was asked to check. Exactly one field is used. */
export interface ScopeTarget {
  routeId?: string;
  routeIds?: readonly string[];
  stopId?: string;
  tripId?: string;
}

/**
 * Non-throwing form of the asserts above, for server actions.
 *
 * Returns the action's own `{ ok: false, error }` shape on a violation and
 * null when the edit is allowed, so a call site reads like the other guards
 * around it:
 *
 * ```ts
 * const denied = await denyOutOfScope(session.user.id, { routeId });
 * if (denied) return denied;
 * ```
 *
 * The message names the owning operator rather than a bare "forbidden": the
 * person hitting this is a real dispatcher who needs to know whom to ask.
 */
export async function denyOutOfScope(
  userId: string,
  target: ScopeTarget,
): Promise<{ ok: false; error: string } | null> {
  try {
    if (target.routeId !== undefined) {
      await assertRouteInScope(userId, target.routeId);
    } else if (target.routeIds !== undefined) {
      await assertRoutesInScope(userId, target.routeIds);
    } else if (target.stopId !== undefined) {
      await assertStopInScope(userId, target.stopId);
    } else if (target.tripId !== undefined) {
      await assertTripInScope(userId, target.tripId);
    }
    return null;
  } catch (err) {
    if (err instanceof OperatorScopeError) {
      return { ok: false, error: err.message.replace(/^Forbidden: /, "") };
    }
    throw err;
  }
}
