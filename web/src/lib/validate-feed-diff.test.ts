import { describe, expect, it } from "vitest";
// scripts/ lives outside the @/ (src) alias root, so this cross-root test
// import has no alias to use.
// eslint-disable-next-line no-restricted-imports
import {
  errorCountsFromReport,
  findRegressions,
} from "../../scripts/validate-feed-diff-lib.mjs";

describe("errorCountsFromReport", () => {
  it("counts only ERROR notices and ignores WARNING/INFO", () => {
    const counts = errorCountsFromReport({
      notices: [
        { code: "missing_file", severity: "ERROR", totalNotices: 2 },
        { code: "unused_shape", severity: "WARNING", totalNotices: 9 },
        { code: "info_thing", severity: "INFO", totalNotices: 1 },
      ],
    });
    expect([...counts.entries()]).toEqual([["missing_file", 2]]);
  });

  it("falls back to sampleNotices length when totalNotices is absent", () => {
    const counts = errorCountsFromReport({
      notices: [
        {
          code: "foreign_key",
          severity: "error",
          sampleNotices: [{}, {}, {}],
        },
      ],
    });
    expect(counts.get("foreign_key")).toBe(3);
  });
});

describe("findRegressions", () => {
  it("flags new or increased ERROR codes only", () => {
    const baseline = new Map([
      ["missing_file", 1],
      ["foreign_key", 5],
    ]);
    const candidate = new Map([
      ["missing_file", 1],
      ["foreign_key", 7],
      ["new_error", 1],
    ]);
    expect(findRegressions(baseline, candidate)).toEqual([
      { code: "foreign_key", base: 5, count: 7 },
      { code: "new_error", base: 0, count: 1 },
    ]);
  });

  it("passes when candidate errors are equal or lower", () => {
    const baseline = new Map([["missing_file", 3]]);
    const candidate = new Map([["missing_file", 2]]);
    expect(findRegressions(baseline, candidate)).toEqual([]);
  });
});
