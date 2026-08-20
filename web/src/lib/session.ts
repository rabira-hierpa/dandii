import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Prisma } from "@/generated/prisma/client";
import { auth } from "@/lib/auth";
import { getUserOperatorCode } from "@/lib/operator-scope";
import type { OperatorCode } from "@/lib/operators";
import type { AppRole } from "@/lib/permissions";

/**
 * Memoized per render pass. The console layout and every page call
 * `requireRole` independently, so an unmemoized session lookup runs at least
 * twice per navigation. `cache` is React's request-level memo (Next 16 docs,
 * "Sharing data with context and React.cache").
 */
export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

/** Same memoization, for the operator scope read that now rides along. */
const cachedOperatorCode = cache(async (userId: string) => {
  return getUserOperatorCode(userId);
});

/**
 * Server-side gate for layouts and pages. Redirects to sign-in when
 * unauthenticated, or home when the role is insufficient.
 */
export async function requireRole(allowed: AppRole[]) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }
  const role = (session.user.role ?? "user") as AppRole;
  if (!allowed.includes(role)) {
    redirect("/access-denied");
  }
  return { session, role };
}

/**
 * What a console surface is allowed to see.
 *
 * `requireRole` answers "may this person open the console". This answers
 * "which operator's data is theirs", and hands back the `where` fragment to
 * prove it — the filter arrives with the authorization rather than being a
 * second thing each page has to remember. Forgetting the second thing is how
 * all eleven console surfaces ended up unscoped.
 *
 * `operatorCode` is null for the network-wide roles. A `route-operator` with
 * no operator throws out of `getUserOperatorCode` rather than reaching a page,
 * which is fail-closed and is what the pre-deploy backfill gate exists to
 * prevent anyone meeting (scripts/backfill-operator-codes.ts).
 */
export async function requireConsoleScope(allowed: AppRole[]) {
  const { session, role } = await requireRole(allowed);
  const operatorCode = await cachedOperatorCode(session.user.id);

  // Spread into any Route query. Empty for network-wide roles, so an admin's
  // query is byte-identical to what it was before scoping existed.
  const routeWhere: Prisma.RouteWhereInput = operatorCode
    ? { assignment: { operator: { code: operatorCode } } }
    : {};

  return {
    session,
    role,
    operatorCode: operatorCode as OperatorCode | null,
    routeWhere,
    /** True when this viewer is limited to a single operator. */
    scoped: operatorCode !== null,
  };
}

/**
 * `requireConsoleScope` for API routes.
 *
 * Same scope, different failure mode: `requireConsoleScope` redirects, which
 * is right for a page and wrong for JSON. This throws, like the
 * `requirePermission` it wraps, so a route handler fails as a 500 rather than
 * quietly serving a login page body to a fetch().
 */
export async function requirePermissionScope(
  permissions: Partial<Record<string, string[]>>,
) {
  const session = await requirePermission(permissions);
  const operatorCode = await cachedOperatorCode(session.user.id);
  const routeWhere: Prisma.RouteWhereInput = operatorCode
    ? { assignment: { operator: { code: operatorCode } } }
    : {};
  return {
    session,
    operatorCode: operatorCode as OperatorCode | null,
    routeWhere,
    scoped: operatorCode !== null,
  };
}

/**
 * Permission check for server actions. Throws instead of redirecting so
 * actions fail loudly when called outside their allowed roles.
 */
export async function requirePermission(
  permissions: Partial<Record<string, string[]>>,
) {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized: no session");
  }
  const result = await auth.api.userHasPermission({
    body: {
      userId: session.user.id,
      permissions: permissions as Record<string, string[]>,
    },
  });
  if (!result.success) {
    throw new Error("Forbidden: missing permission");
  }
  return session;
}
