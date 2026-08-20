import { readFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guard for per-operator scoping.
 *
 * The bug this exists to prevent already happened once: write scoping shipped
 * and all eleven console read surfaces were missed, because nothing connected
 * "add a console page" to "apply the operator filter". A page added six months
 * from now defaults to leaking every operator's data unless something fails.
 * This is that something.
 *
 * Honest about its own limits: an import check proves the helper is reachable,
 * not that its `where` reached every query in the file. It catches the
 * whole-file omission, which is the failure mode observed. Per-surface
 * behaviour is covered by the tests beside each surface.
 */

const APP = path.join(process.cwd(), "src", "app");

/** Anything that authorizes AND yields the operator scope. */
const SCOPE_HELPERS = ["requireConsoleScope", "requirePermissionScope"];

/**
 * Surfaces that legitimately need no scope, each with the reason. Adding an
 * entry here is a deliberate act that shows up in review — which is the point.
 */
const EXEMPT: Record<string, string> = {
  "api/console/snap/route.ts":
    "takes raw coordinates and returns a snapped line; owns no route data",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/** Every console-facing page, layout and route handler. */
function consoleSurfaces(): string[] {
  const roots = [path.join(APP, "console"), path.join(APP, "api", "console")];
  return roots
    .flatMap((r) => walk(r))
    .filter((f) => /\/(page|layout|route)\.tsx?$/.test(f))
    .map((f) => path.relative(APP, f))
    .sort();
}

describe("console scope coverage", () => {
  it("finds the console surfaces at all", () => {
    // Guards against the walker silently matching nothing after a move, which
    // would make every assertion below vacuously pass.
    expect(consoleSurfaces().length).toBeGreaterThanOrEqual(10);
  });

  it.each(consoleSurfaces())("%s resolves the operator scope", (relative) => {
    if (EXEMPT[relative]) {
      expect(EXEMPT[relative].length).toBeGreaterThan(20);
      return;
    }
    const source = readFileSync(path.join(APP, relative), "utf8");
    const usesHelper = SCOPE_HELPERS.some((h) => source.includes(h));

    expect(
      usesHelper,
      `${relative} does not call requireConsoleScope or requirePermissionScope.\n` +
        `Every console surface must resolve the viewer's operator, or be listed\n` +
        `in EXEMPT with a reason. Without it the page serves every operator's data.`,
    ).toBe(true);
  });

  it("does not let a surface keep the unscoped requireRole by itself", () => {
    // requireRole answers "may they open the console", not "whose data".
    // A console surface that calls only requireRole is the exact shape of the
    // original bug.
    const offenders = consoleSurfaces().filter((relative) => {
      if (EXEMPT[relative]) return false;
      const source = readFileSync(path.join(APP, relative), "utf8");
      return (
        source.includes("requireRole(") &&
        !SCOPE_HELPERS.some((h) => source.includes(h))
      );
    });

    expect(offenders, `unscoped console surfaces: ${offenders.join(", ")}`)
      .toEqual([]);
  });

  it("keeps the public rider endpoint unscoped", () => {
    // The inverse guard: /api/geo/routes must NOT gain a session-derived
    // filter, or the public map silently empties for anonymous riders.
    const publicGeo = readFileSync(
      path.join(APP, "api", "geo", "routes", "route.ts"),
      "utf8",
    );
    expect(publicGeo).not.toContain("requirePermissionScope");
    expect(publicGeo).not.toContain("requireConsoleScope");
  });
});
