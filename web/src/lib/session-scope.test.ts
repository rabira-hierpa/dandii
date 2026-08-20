import type * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `where` fragment `requireConsoleScope` hands out.
 *
 * Its shape is load-bearing in a way that is easy to miss: it writes the same
 * `assignment.operator` key that `/console/routes`'s `?operator=` filter does,
 * and the pages spread it LAST so identity overwrites the URL. If the shape
 * ever drifts, the two stop colliding and the URL filter silently wins again.
 */

const prisma = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
const auth = vi.hoisted(() => ({
  api: { getSession: vi.fn(), userHasPermission: vi.fn() },
}));
const redirect = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({ redirect }));
// React's cache() is a per-request memo; identity passthrough is the right
// stand-in outside a render pass.
vi.mock("react", async (orig) => ({
  ...(await orig<typeof React>()),
  cache: <T,>(fn: T) => fn,
}));

const { requireConsoleScope } = await import("./session");

beforeEach(() => {
  vi.clearAllMocks();
  auth.api.getSession.mockResolvedValue({
    user: { id: "u1", name: "Dev", email: "d@x.com", role: "route-operator" },
  });
  prisma.user.findUnique.mockResolvedValue({
    role: "route-operator",
    operatorCode: "ANBESSA",
  });
});

describe("requireConsoleScope", () => {
  it("builds a where that filters routes to the viewer's operator", async () => {
    const scope = await requireConsoleScope(["route-operator"]);

    expect(scope.operatorCode).toBe("ANBESSA");
    expect(scope.scoped).toBe(true);
    expect(scope.routeWhere).toEqual({
      assignment: { operator: { code: "ANBESSA" } },
    });
  });

  it("writes the same key the ?operator= filter writes, so it overwrites it", async () => {
    // The pages rely on this collision: { ...urlFilter, ...routeWhere }.
    const scope = await requireConsoleScope(["route-operator"]);
    const urlFilter = { assignment: { operator: { code: "LRT" } } };

    expect({ ...urlFilter, ...scope.routeWhere }).toEqual({
      assignment: { operator: { code: "ANBESSA" } },
    });
  });

  it("gives a network-wide role an empty where, not a filter", async () => {
    auth.api.getSession.mockResolvedValue({
      user: { id: "u2", name: "Boss", email: "b@x.com", role: "admin" },
    });
    prisma.user.findUnique.mockResolvedValue({
      role: "admin",
      operatorCode: null,
    });

    const scope = await requireConsoleScope(["admin"]);

    expect(scope.scoped).toBe(false);
    expect(scope.operatorCode).toBeNull();
    // Empty, so an admin's query is byte-identical to the pre-scoping one.
    expect(scope.routeWhere).toEqual({});
  });

  it("refuses a route-operator whose operator was never assigned", async () => {
    prisma.user.findUnique.mockResolvedValue({
      role: "route-operator",
      operatorCode: null,
    });

    await expect(requireConsoleScope(["route-operator"])).rejects.toThrow(
      /no operator assigned/,
    );
  });

  it("redirects an unauthenticated visitor before any scope lookup", async () => {
    auth.api.getSession.mockResolvedValue(null);
    // redirect() is mocked to a no-op, so execution continues and the session
    // read throws — what matters is that redirect fired and no scope was read.
    await requireConsoleScope(["route-operator"]).catch(() => undefined);

    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
