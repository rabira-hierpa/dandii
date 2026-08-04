import { describe, expect, it } from "vitest";
import {
  BADGE_LABELS,
  COUNT_BADGES,
  LEVELS,
  OPERATOR_SPREAD_BADGE,
  POINTS,
  STREAK_BADGE,
  computeStreakWeeks,
  levelForPoints,
  weekIndex,
} from "./points";

/** A fixed "now" so streak tests never depend on the real calendar. */
const NOW = new Date("2026-08-02T12:00:00.000Z");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
/** A date N whole weeks before NOW. */
const weeksAgo = (n: number) => new Date(NOW.getTime() - n * WEEK_MS);

describe("weekIndex", () => {
  it("is stable within a week and increments across weeks", () => {
    expect(weekIndex(NOW)).toBe(weekIndex(new Date(NOW.getTime() + 3600_000)));
    expect(weekIndex(weeksAgo(1))).toBe(weekIndex(NOW) - 1);
    expect(weekIndex(weeksAgo(5))).toBe(weekIndex(NOW) - 5);
  });
});

describe("computeStreakWeeks", () => {
  it("is 0 with no contributions", () => {
    expect(computeStreakWeeks([], NOW)).toBe(0);
  });

  it("counts consecutive weeks ending this week", () => {
    const dates = [weeksAgo(0), weeksAgo(1), weeksAgo(2)];
    expect(computeStreakWeeks(dates, NOW)).toBe(3);
  });

  it("stays alive when the latest contribution was last week (grace week)", () => {
    expect(computeStreakWeeks([weeksAgo(1), weeksAgo(2)], NOW)).toBe(2);
  });

  it("resets to 0 after two missed weeks", () => {
    expect(computeStreakWeeks([weeksAgo(2), weeksAgo(3)], NOW)).toBe(0);
  });

  it("stops at the first gap rather than counting total weeks", () => {
    // this week, last week, then a gap at 2, resuming at 3-4
    const dates = [weeksAgo(0), weeksAgo(1), weeksAgo(3), weeksAgo(4)];
    expect(computeStreakWeeks(dates, NOW)).toBe(2);
  });

  it("counts several contributions in one week only once", () => {
    const sameWeek = [
      weeksAgo(0),
      new Date(NOW.getTime() - 3600_000),
      new Date(NOW.getTime() - 7200_000),
    ];
    expect(computeStreakWeeks(sameWeek, NOW)).toBe(1);
  });

  it("is order-independent", () => {
    const shuffled = [weeksAgo(2), weeksAgo(0), weeksAgo(1)];
    expect(computeStreakWeeks(shuffled, NOW)).toBe(3);
  });
});

describe("R2 milestone badges", () => {
  it("rewards breadth across operators, not one corridor", () => {
    expect(OPERATOR_SPREAD_BADGE.operatorsRequired).toBeGreaterThan(1);
    expect(OPERATOR_SPREAD_BADGE.bonus).toBeGreaterThan(0);
  });

  it("requires a multi-week habit for the streak badge", () => {
    expect(STREAK_BADGE.weeksRequired).toBeGreaterThan(1);
  });

  it("exposes a label for every badge id", () => {
    for (const b of COUNT_BADGES) expect(BADGE_LABELS[b.badge]).toBeTruthy();
    expect(BADGE_LABELS[OPERATOR_SPREAD_BADGE.badge]).toBeTruthy();
    expect(BADGE_LABELS[STREAK_BADGE.badge]).toBeTruthy();
  });
});

describe("POINTS values", () => {
  it("rewards approval far more than submission (anti-spam design rule)", () => {
    expect(POINTS.APPROVED).toBeGreaterThan(POINTS.SUBMIT * 5);
  });

  it("claws back exactly the submit nod on rejection, so junk nets zero", () => {
    expect(POINTS.SUBMIT + POINTS.REJECT_CLAWBACK).toBe(0);
  });

  it("gives partial credit for a superseded (correct but late) proposal", () => {
    expect(POINTS.SUPERSEDED_CREDIT).toBeGreaterThan(POINTS.SUBMIT);
    expect(POINTS.SUPERSEDED_CREDIT).toBeLessThan(POINTS.APPROVED);
  });
});

describe("levelForPoints", () => {
  it("starts everyone at level 1", () => {
    const p = levelForPoints(0);
    expect(p.level).toBe(1);
    expect(p.title).toBe("Newcomer");
    expect(p.percent).toBe(0);
  });

  it("reports the level whose threshold the points reach", () => {
    expect(levelForPoints(25).level).toBe(2);
    expect(levelForPoints(74).level).toBe(2);
    expect(levelForPoints(75).level).toBe(3);
    expect(levelForPoints(200).title).toBe("Route Ranger");
  });

  it("computes progress toward the next level", () => {
    // Level 2 spans 25..75 (span 50); 50 points is halfway.
    const p = levelForPoints(50);
    expect(p.level).toBe(2);
    expect(p.nextAt).toBe(75);
    expect(p.toNext).toBe(25);
    expect(p.percent).toBe(50);
  });

  it("caps out at the highest level with no next threshold", () => {
    const top = LEVELS[LEVELS.length - 1];
    const p = levelForPoints(top.from + 5000);
    expect(p.level).toBe(top.level);
    expect(p.nextAt).toBeNull();
    expect(p.toNext).toBeNull();
    expect(p.percent).toBe(100);
  });

  it("never goes below level 1 for negative or invalid totals", () => {
    // A net-negative balance (clawbacks) must not produce a broken level.
    expect(levelForPoints(-50).level).toBe(1);
    expect(levelForPoints(-50).points).toBe(0);
    expect(levelForPoints(Number.NaN).level).toBe(1);
  });

  it("truncates fractional points", () => {
    expect(levelForPoints(25.9).points).toBe(25);
  });

  it("percent stays within 0..100 across the whole ladder", () => {
    for (let pts = 0; pts <= 1200; pts += 7) {
      const p = levelForPoints(pts);
      expect(p.percent).toBeGreaterThanOrEqual(0);
      expect(p.percent).toBeLessThanOrEqual(100);
    }
  });
});

describe("COUNT_BADGES", () => {
  it("is ordered by increasing difficulty and reward", () => {
    for (let i = 1; i < COUNT_BADGES.length; i++) {
      expect(COUNT_BADGES[i].approvedRequired).toBeGreaterThan(
        COUNT_BADGES[i - 1].approvedRequired,
      );
      expect(COUNT_BADGES[i].bonus).toBeGreaterThan(COUNT_BADGES[i - 1].bonus);
    }
  });

  it("awards the first badge on the very first approved fix", () => {
    expect(COUNT_BADGES[0].approvedRequired).toBe(1);
  });

  it("has unique badge ids", () => {
    const ids = COUNT_BADGES.map((b) => b.badge);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
