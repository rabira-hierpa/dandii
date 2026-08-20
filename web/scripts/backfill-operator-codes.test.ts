import { describe, expect, it } from "vitest";
import { parseArgs } from "./backfill-operator-codes";

/**
 * The parser is the part worth testing: a mistyped operator code would grant
 * a dispatcher access to the wrong agency's data, which is the failure this
 * whole scoping effort exists to prevent. It refuses rather than guesses.
 */

describe("parseArgs", () => {
  it("reads an assignment", () => {
    const r = parseArgs(["--set", "a@x.com=ANBESSA"]);
    expect(r.assignments).toEqual([{ email: "a@x.com", code: "ANBESSA" }]);
    expect(r.errors).toEqual([]);
  });

  it("reads several assignments and a demotion together", () => {
    const r = parseArgs([
      "--set", "a@x.com=ANBESSA",
      "--set", "b@x.com=LRT",
      "--demote", "c@x.com",
    ]);
    expect(r.assignments).toHaveLength(2);
    expect(r.demotions).toEqual(["c@x.com"]);
    expect(r.errors).toEqual([]);
  });

  it("rejects an unknown operator instead of assigning it", () => {
    const r = parseArgs(["--set", "a@x.com=ANBESA"]);
    expect(r.assignments).toEqual([]);
    expect(r.errors[0]).toMatch(/unknown operator ANBESA/);
  });

  it("rejects a --set without a code", () => {
    const r = parseArgs(["--set", "a@x.com"]);
    expect(r.assignments).toEqual([]);
    expect(r.errors[0]).toMatch(/needs email=CODE/);
  });

  it("rejects a bare --demote", () => {
    expect(parseArgs(["--demote"]).errors[0]).toMatch(/needs an email/);
  });

  it("rejects an unrecognized flag rather than ignoring it", () => {
    // Silently ignoring --force would let a typo look like it worked.
    expect(parseArgs(["--force"]).errors[0]).toMatch(/unrecognized argument/);
  });

  it("treats no arguments as check-only", () => {
    const r = parseArgs([]);
    expect(r).toEqual({ assignments: [], demotions: [], errors: [] });
  });
});
