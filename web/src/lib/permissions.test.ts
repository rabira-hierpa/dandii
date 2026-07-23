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
