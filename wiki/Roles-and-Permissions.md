# Roles and Permissions

Dandii uses better-auth's admin plugin with a custom access-control statement defined in [`web/src/lib/permissions.ts`](https://github.com/rabira-hierpa/dandii/blob/main/web/src/lib/permissions.ts). This page is the authoritative reference for who can do what.

## Roles

| Role | Console? | Summary |
|---|---|---|
| `super-admin` | ✅ | Everything, including managing admins and system settings. Bootstrapped from `SUPER_ADMIN_EMAIL`. |
| `admin` | ✅ | Manages users below admin, all route/fare/closure operations, reviews fare edits, generates feeds, system settings. Cannot promote/demote admins or impersonate. |
| `route-operator` | ✅ | Assigns routes, manages fares and closures, reviews fare edits, generates feeds. No delete-route, no user management, no settings. |
| `maintainer` | ✅ | Read-only on routes/fares, but manages closures, reviews rider fare edits, and generates feeds. Cannot edit fares directly — approval is the only way a maintainer changes a fare. |
| `user` | — | Default signed-in rider. Reads the public network; saves routes and submits fare corrections. No console. |

`CONSOLE_ROLES = [super-admin, admin, route-operator, maintainer]` · `SETTINGS_ROLES = [super-admin, admin]`.

## Permission matrix

The access-control statement groups capabilities by resource: `route`, `fare`, `closure`, `proposal`, `feed`, `system` (plus `user`/`session` from the admin plugin defaults).

| Capability | super-admin | admin | route-operator | maintainer | user |
|---|:---:|:---:|:---:|:---:|:---:|
| `route:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `route:assign` | ✅ | ✅ | ✅ | — | — |
| `route:create` / `update` | ✅ | ✅ | ✅ | — | — |
| `route:delete` | ✅ | ✅ | — | — | — |
| `fare:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `fare:create` / `update` / `delete` | ✅ | ✅ | ✅ | — | — |
| `closure:read` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `closure:create` / `update` / `delete` | ✅ | ✅ | ✅ | ✅ | — |
| `proposal:review` | ✅ | ✅ | ✅ | ✅ | — |
| `feed:generate` | ✅ | ✅ | ✅ | ✅ | — |
| `system:settings` | ✅ | ✅ | — | — | — |
| manage users / roles | ✅ | ✅¹ | — | — | — |
| promote/demote admins, ban admins | ✅ | — | — | — | — |

¹ Admins manage users **below** admin only.

> **Maintainer nuance:** a maintainer holds `fare:read` but not `fare:update`. They influence fares **only** by approving a rider proposal, which writes through `applyFareChange()`. This is deliberate — see [Crowdsourced Fares](Crowdsourced-Fares).

## Role assignment power (`ASSIGNABLE_ROLES`)

| Actor | Can grant |
|---|---|
| `super-admin` | super-admin, admin, route-operator, maintainer, user |
| `admin` | route-operator, maintainer, user |

## Enforcement (defense in depth)

1. **Proxy** (`proxy.ts`) — cookie gate; unauthenticated requests to `/console` and `/settings` are redirected to sign-in.
2. **Server layouts** — `requireRole(allowed)` re-checks the session and minimum role server-side before rendering.
3. **Server actions** — every mutation calls `requirePermission({ resource: ["action"] })`, which delegates to better-auth's `userHasPermission`. Actions throw (not redirect) so they fail loudly if called out of role.

The first super-admin is bootstrapped by a better-auth `databaseHooks.user.create` hook that matches `SUPER_ADMIN_EMAIL`.

## Related

- [Crowdsourced Fares](Crowdsourced-Fares) · [Operations Console](Operations-Console) · [Configuration](Configuration)
