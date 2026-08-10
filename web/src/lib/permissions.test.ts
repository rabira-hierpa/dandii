import { describe, expect, it } from "vitest";
import {
  ASSIGNABLE_ROLES,
  CONSOLE_ROLES,
  SETTINGS_ROLES,
  roles,
} from "./permissions";

describe("role matrix (T3)", () => {
  it("grants every console-write role proposal:review and feed:generate", () => {
    for (const role of [
      "super-admin",
      "admin",
      "route-operator",
      "maintainer",
    ] as const) {
      const statements = roles[role].statements;
      expect(statements.proposal).toContain("review");
      expect(statements.feed).toContain("generate");
    }
  });

  it("keeps citizens out of the console and proposal review", () => {
    expect(CONSOLE_ROLES).not.toContain("user");
    // Citizen role only declares route/fare/closure — no proposal or feed keys.
    expect("proposal" in roles.user.statements).toBe(false);
    expect("feed" in roles.user.statements).toBe(false);
  });

  it("denies maintainers direct fare:update (approvals use applyFareChange)", () => {
    expect(roles.maintainer.statements.fare).toEqual(["read"]);
    expect(roles.maintainer.statements.fare).not.toContain("update");
  });

  it("limits who can open settings and who admins may assign", () => {
    expect(SETTINGS_ROLES).toEqual(["super-admin", "admin"]);
    expect(ASSIGNABLE_ROLES.admin).toEqual([
      "route-operator",
      "maintainer",
      "user",
    ]);
    expect(ASSIGNABLE_ROLES.admin).not.toContain("super-admin");
  });
});

/** docs/route-editor-design.md §5. */
describe("feed-edit matrix (Batch D)", () => {
  it("lets super-admin, admin and route-operator correct the feed", () => {
    for (const role of ["super-admin", "admin", "route-operator"] as const) {
      const feedEdit = roles[role].statements.feedEdit;
      expect(feedEdit).toContain("edit"); // route fields (5a)
      expect(feedEdit).toContain("rename"); // stop names (5c-rename)
      expect(feedEdit).toContain("shape"); // sequence + geometry (5b/5c)
    }
  });

  it("reserves publish for admin and above", () => {
    // Publishing reseeds the DB and rebuilds the OTP graph — it hits every rider.
    expect(roles["super-admin"].statements.feedEdit).toContain("publish");
    expect(roles.admin.statements.feedEdit).toContain("publish");
    expect(roles["route-operator"].statements.feedEdit).not.toContain("publish");
  });

  it("keeps maintainers and citizens out of feed editing entirely", () => {
    expect("feedEdit" in roles.maintainer.statements).toBe(false);
    expect("feedEdit" in roles.user.statements).toBe(false);
  });
});
