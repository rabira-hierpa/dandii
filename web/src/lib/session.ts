import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { AppRole } from "@/lib/permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

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
