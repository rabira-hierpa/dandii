import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Resources and actions governing the transit console.
 * `user`/`session` statements come from the admin plugin defaults.
 */
export const statement = {
  ...defaultStatements,
  route: ["read", "assign", "create", "update", "delete"],
  fare: ["read", "create", "update", "delete"],
  // Maintainers may only create closures with reason MAINTENANCE/OTHER —
  // that narrowing is enforced in the closure server actions.
  closure: ["read", "create", "update", "delete"],
  // Reviewing (approve/reject) a rider fare proposal. This is the ONLY way a
  // maintainer influences fares — they cannot edit fares directly (that needs
  // fare:update, route-operator+). Approval writes fares via the permission-
  // free applyFareChange helper.
  proposal: ["review"],
  // Generating a versioned GTFS export (fares overlay). Held by every console-
  // write role — the same set that reviews proposals — so a maintainer can
  // publish a feed after approving corrections.
  feed: ["generate"],
  system: ["settings"],
} as const;

export const ac = createAccessControl(statement);

export const superAdminRole = ac.newRole({
  ...adminAc.statements,
  route: ["read", "assign", "create", "update", "delete"],
  fare: ["read", "create", "update", "delete"],
  closure: ["read", "create", "update", "delete"],
  proposal: ["review"],
  feed: ["generate"],
  system: ["settings"],
});

export const adminRole = ac.newRole({
  // Can manage users below admin (enforced in user actions), but not impersonate.
  user: ["create", "list", "set-role", "ban", "delete", "set-password"],
  session: ["list", "revoke", "delete"],
  route: ["read", "assign", "create", "update", "delete"],
  fare: ["read", "create", "update", "delete"],
  closure: ["read", "create", "update", "delete"],
  proposal: ["review"],
  feed: ["generate"],
  system: ["settings"],
});

export const routeOperatorRole = ac.newRole({
  // May create and edit routes, but deleting them needs admin or above.
  route: ["read", "assign", "create", "update"],
  fare: ["read", "create", "update", "delete"],
  closure: ["read", "create", "update", "delete"],
  proposal: ["review"],
  feed: ["generate"],
});

export const maintainerRole = ac.newRole({
  route: ["read"],
  fare: ["read"],
  closure: ["read", "create", "update", "delete"],
  proposal: ["review"],
  feed: ["generate"],
});

/** Regular signed-in citizens: no console access. */
export const userRole = ac.newRole({
  route: ["read"],
  fare: ["read"],
  closure: ["read"],
});

export const roles = {
  "super-admin": superAdminRole,
  admin: adminRole,
  "route-operator": routeOperatorRole,
  maintainer: maintainerRole,
  user: userRole,
} as const;

export type AppRole = keyof typeof roles;

/** Roles allowed into the ops console at all. */
export const CONSOLE_ROLES: AppRole[] = [
  "super-admin",
  "admin",
  "route-operator",
  "maintainer",
];

/** Roles allowed into the settings area (user/system management). */
export const SETTINGS_ROLES: AppRole[] = ["super-admin", "admin"];

/** Role-assignment power: which roles each role may grant. */
export const ASSIGNABLE_ROLES: Record<string, AppRole[]> = {
  "super-admin": ["super-admin", "admin", "route-operator", "maintainer", "user"],
  admin: ["route-operator", "maintainer", "user"],
};
